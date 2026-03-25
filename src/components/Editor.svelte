<script lang="ts">
    import { Compartment, EditorSelection, EditorState, RangeSet } from "@codemirror/state";
    import {
        Decoration,
        EditorView,
        ViewPlugin,
        highlightActiveLine,
        keymap,
        lineNumbers,
        placeholder,
    } from "@codemirror/view";
    import { minimalSetup } from "codemirror";
    import { indentWithTab } from "@codemirror/commands";
    import { syntaxHighlighting, defaultHighlightStyle, indentUnit } from "@codemirror/language";
    import { closeBrackets } from "@codemirror/autocomplete";
    import { onMount } from "svelte";
    import { javascript } from "@codemirror/lang-javascript";
    import { python } from "@codemirror/lang-python";
    import { java } from "@codemirror/lang-java";
    import { csharp } from "@replit/codemirror-lang-csharp";
    import equal from "fast-deep-equal";

    interface Props {
        language: string;
        code: string;
        selections: [number, number][];
        highlightedRanges: [number, number][];
        fullscreen: boolean;
        onshowexamples: () => void;
    }

    const languages = {
        JavaScript: javascript,
        Python: python,
        Java: java,
        "C#": csharp,
    };

    let {
        language,
        code = $bindable(),
        selections = $bindable(),
        highlightedRanges,
        fullscreen,
        onshowexamples,
    }: Props = $props();

    let editor: HTMLDivElement;
    let hadFocus = $state(false);

    let placeholderElement: HTMLDivElement;

    let view: EditorView;
    onMount(() => {
        view = new EditorView({
            doc: code,
            parent: editor,
            extensions: [
                minimalSetup,
                lineNumbers(),
                highlightActiveLine(),
                closeBrackets(),
                languageExtension.of([]),
                syntaxHighlighting(defaultHighlightStyle),
                indentUnit.of(" ".repeat(4)),
                keymap.of([indentWithTab]),
                placeholder(() => {
                    const placeholder = placeholderElement;
                    placeholder.classList.remove("hidden");
                    return placeholder;
                }),
                EditorView.lineWrapping,
                EditorState.allowMultipleSelections.of(true),
                highlights.of([]),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        code = update.state.doc.toString();
                    }

                    if (update.selectionSet && !$effect.tracking()) {
                        const newSelections = update.state.selection.ranges
                            .map((range): [number, number] => [range.from, range.to])
                            .filter(([from, to]) => from !== to);

                        if (!equal(newSelections, selections)) {
                            selections = newSelections;
                        }
                    }

                    if (update.focusChanged && update.view.hasFocus) {
                        hadFocus = true;
                    }
                }),
            ],
        });
    });

    const updateSelections = (selections: [number, number][]) => {
        if (selections.length > 0) {
            view.dispatch({
                selection: EditorSelection.create(
                    selections.map(([from, to]) => EditorSelection.range(from, to)),
                ),
            });
        }
    };

    onMount(() => {
        view.focus();
    });

    $effect(() => {
        if (code === view.state.doc.toString()) {
            return;
        }

        view.dispatch({
            changes: {
                from: 0,
                to: view.state.doc.length,
                insert: code,
            },
        });
    });

    $effect(() => {
        updateSelections(selections);
    });

    const languageExtension = new Compartment();

    $effect(() => {
        view.dispatch({
            effects: languageExtension.reconfigure(
                languages[language as keyof typeof languages]() ?? languages.JavaScript(),
            ),
        });
    });

    const highlightRanges = (ranges: [number, number][], decoration: Decoration) =>
        ViewPlugin.fromClass(class {}, {
            decorations: () =>
                RangeSet.of(
                    ranges.map(([from, to]) => decoration.range(from, to)),
                    true,
                ),
        });

    const highlights = new Compartment();

    $effect(() => {
        const decoration = Decoration.mark({
            class: `rounded-sm bg-sky-500/20 text-sky-900`,
        });

        view.dispatch({
            effects: highlights.reconfigure(highlightRanges(highlightedRanges, decoration)),
        });
    });
</script>

<div
    bind:this={editor}
    data-hadFocus={hadFocus || undefined}
    class="flex-1"
    style:--font-size={fullscreen ? "16pt" : "12pt"}
></div>

<div bind:this={placeholderElement} class="hidden">
    Paste your code here, or
    <button onclick={onshowexamples} class="pointer-events-auto cursor-pointer text-blue-500">
        browse examples
    </button>
</div>

<style>
    :global(.cm-editor) {
        width: 100%;
        height: 100%;

        &.cm-focused {
            outline: none;
        }

        & .cm-scroller {
            font-size: var(--font-size);
            font-family: var(--font-mono);
        }

        & .cm-gutters {
            background: none;
        }

        & .cm-gutterElement {
            margin-right: 4px;
        }

        & .cm-cursor {
            border-radius: 4px;
            border-left-width: 2px;
            border-left-color: var(--color-blue-500);
        }
    }

    :not([data-hadFocus]) {
        :global(.cm-editor .cm-activeLineGutter),
        :global(.cm-editor .cm-activeLine) {
            background: none;
        }
    }
</style>
