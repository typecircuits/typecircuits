import { Mutex } from "async-mutex";
import type { Language } from ".";
import { makeNode, type Node } from "../compiler";
import { ConcreteType } from "../solver";
import initWipple, * as wipple from "wipple";
import wippleWasmPath from "wipple/pkg/wipple_api_bg.wasm";
import foundationBinUrl from "../../../vendor/wipple-foundation.bin";

const mutex = new Mutex();
let wippleIsLoaded = false;

const loadWipple = () =>
    mutex.runExclusive(async () => {
        if (wippleIsLoaded) return;

        await initWipple({
            module_or_path: fetch(new URL(wippleWasmPath as any, import.meta.url)),
        });

        const foundationBin = await fetch(new URL(foundationBinUrl, import.meta.url)).then(
            (response) => response.arrayBuffer(),
        );

        wipple.register_library("foundation", new Uint8Array(foundationBin));

        wippleIsLoaded = true;
    });

export const wippleLanguage: Language<wipple.Graph> = {
    name: "Wipple",
    editorExtensions: async () => [await highlightExtension()],
    parse: async (code) => {
        await loadWipple();

        const file = new wipple.File("input", code);
        const compileResult = wipple.compile([file], "foundation", true);

        try {
            return compileResult?.graph();
        } finally {
            compileResult?.free();
        }
    },
    compile: async (graph, compiler) => {
        try {
            const types = new Map<string, ConcreteType>();

            const getType = (kind: string | undefined, display: string) => {
                const key = display;

                if (types.has(key)) {
                    return types.get(key)!;
                }

                const type = new (class extends ConcreteType {
                    kind = kind;

                    render(): string {
                        return display;
                    }
                })();

                types.set(key, type);

                return type;
            };

            const nodes = new Map<string, Node>();
            for (const nodeOptions of graph.nodes) {
                nodes.set(
                    nodeOptions.id,
                    makeNode({
                        id: nodeOptions.id,
                        type: "wipple",
                        code: nodeOptions.span.source,
                        pos: {
                            start: nodeOptions.span.start.index,
                            end: nodeOptions.span.end.index,
                        },
                        parent: undefined,
                        children: [],
                        fields: {},
                        strings: {},
                    }),
                );
            }

            for (const edgeOptions of graph.edges) {
                const from = nodes.get(edgeOptions.from)!;
                const to = nodes.get(edgeOptions.to)!;

                compiler.edge(from, to, edgeOptions.label);
            }

            for (const groupOptions of graph.groups) {
                if (groupOptions.nodes.length === 0) {
                    continue;
                }

                const [representative, ...others] = groupOptions.nodes.map((id) => nodes.get(id)!);

                for (const other of others) {
                    compiler.solver.unifyAt(representative, [representative, other]);
                }

                for (const labelOptions of groupOptions.labels) {
                    const type = getType(labelOptions.kind, labelOptions.display);
                    compiler.solver.unifyAt(representative, [representative, type]);
                }
            }
        } finally {
            graph.free();
        }
    },
};

const highlightExtension = async () => {
    const { default: tokens, tokensRegex } = await import(
        // @ts-ignore
        "../../../vendor/wipple/playground/src/tokens"
    );

    const { Decoration, EditorView, MatchDecorator, ViewPlugin } = await import("@codemirror/view");
    const { highlightingFor } = await import("@codemirror/language");
    const { tags } = await import("@lezer/highlight");

    const tagNames = {
        comment: tags.comment,
        string: tags.string,
        number: tags.number,
        operator: tags.operator,
        keyword: tags.keyword,
        type: tags.typeName,
    };

    const decorator = new MatchDecorator({
        regexp: tokensRegex,
        decorate: (add, from, to, match, view) => {
            const [token] =
                (match.groups &&
                    Object.entries(match.groups).find(([_, value]) => value !== undefined)) ??
                [];

            if (token != null) {
                const { highlight } = tokens[token];

                const className =
                    highlight != null && highlight in tagNames
                        ? highlightingFor(view.state, [(tagNames as any)[highlight]])
                        : undefined;

                if (className != null) {
                    add(from, to, Decoration.mark({ class: className }));
                }
            }
        },
    });

    return ViewPlugin.fromClass(
        class {
            public decorations: import("@codemirror/view").DecorationSet;

            constructor(view: import("@codemirror/view").EditorView) {
                this.decorations = decorator.createDeco(view);
            }

            update(update: import("@codemirror/view").ViewUpdate) {
                this.decorations = decorator.updateDeco(update, this.decorations);
            }
        },
        {
            decorations: (instance) => instance.decorations,
            provide: (plugin) =>
                EditorView.atomicRanges.of(
                    (view) => view.plugin(plugin)?.decorations ?? Decoration.none,
                ),
        },
    );
};
