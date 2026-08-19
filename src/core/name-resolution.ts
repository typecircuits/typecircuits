import type { Node } from "./compiler";

export const makeNameResolver = <Definition, NameKind>(root: Node) => {
    const scopes = new Map<Node, Map<string, Definition[]>>();
    scopes.set(root, new Map());

    const kinds = new Map<Node, NameKind>();

    const getScopes = (node: Node) => {
        const result: Map<string, Definition[]>[] = [];
        for (let current: Node | undefined = node; current != null; current = current.parent) {
            if (scopes.has(current)) {
                result.push(scopes.get(current)!);
            }
        }

        if (root != null) {
            result.push(scopes.get(root)!);
        }

        return result;
    };

    const implicitlyDefined = new Set<Node>();

    return {
        scope: (node: Node) => {
            scopes.set(node, new Map());
        },
        setKind: (node: Node, kind: NameKind) => {
            kinds.set(node, kind);
        },
        getKind: (node: Node): NameKind | undefined => {
            return kinds.get(node);
        },
        define: (name: string, node: Node, definition: Definition) => {
            const scope = getScopes(node)[0];

            if (!scope.has(name)) {
                scope.set(name, []);
            }

            scope.get(name)!.push(definition);
        },
        resolve: (
            name: string,
            node: Node,
            options: { implicitlyDefine?: () => Definition | undefined } = {},
        ): Definition[] => {
            const scopes = getScopes(node);

            for (const scope of scopes) {
                if (scope.has(name)) {
                    const definitions = scope.get(name)!;
                    if (definitions.length > 0) {
                        return definitions;
                    }
                }
            }

            if (!implicitlyDefined.has(node)) {
                const scope = scopes.at(-1);
                if (scope != null) {
                    if (!scope.has(name)) {
                        scope.set(name, []);
                    }

                    const implicitDefinition = options.implicitlyDefine?.();
                    if (implicitDefinition != null) {
                        implicitlyDefined.add(node);
                        scope.get(name)!.push(implicitDefinition);
                        return [implicitDefinition];
                    }
                }
            }

            return [];
        },
    };
};
