import { Node, type Feature, type Selector, event } from "../index";

export interface NameResolutionOptions {
    definitions: Selector<{ definition: Node; value?: Record<string, Node> }[]>[];
    scopes: Selector<Node>[];
    names: Selector<Node>[];
    ignore: string[];
    implicit: (node: Node) => boolean;
}

export const nameResolution =
    (options: NameResolutionOptions): Feature =>
    (context) => {
        const definitionSelectors = options.definitions.map((selector) =>
            event("definition", selector),
        );
        const scopeSelectors = options.scopes.map((selector) => event("scope", selector));
        const nameSelectors = options.names.map((selector) => event("name", selector));

        const scopes = new Map<Node, Map<string, Node[]>>();

        if (context.root != null) {
            scopes.set(context.root, new Map());
        }

        const getScopes = (node: Node) => {
            const result: Map<string, Node[]>[] = [];
            for (let current: Node | undefined = node; current != null; current = current.parent) {
                if (scopes.has(current)) {
                    result.push(scopes.get(current)!);
                }
            }

            if (context.root != null) {
                result.push(scopes.get(context.root)!);
            }

            return result;
        };

        context.select([...definitionSelectors, ...scopeSelectors, ...nameSelectors], (event) => {
            switch (event.type) {
                case "scope": {
                    scopes.set(event.value, new Map());
                    break;
                }
                case "definition": {
                    for (const { definition, value } of event.value) {
                        const name = definition.text;

                        const scope = getScopes(definition)[0];
                        if (!scope.has(name)) scope.set(name, []);
                        scope.get(name)!.push(definition);

                        if (value != null && definition.type in value) {
                            context.edge(value[definition.type], definition, "value");
                            context.group(definition, value[definition.type]);
                        }
                    }

                    break;
                }
                case "name": {
                    const name = event.value.text;

                    const scopes = getScopes(event.value);

                    for (const scope of scopes) {
                        if (scope.has(name)) {
                            for (const definition of scope.get(name)!) {
                                if (event.value === definition) {
                                    break;
                                }

                                context.replace(event.value, definition);
                                context.group(event.value, definition);
                            }

                            return;
                        }
                    }

                    // If the name wasn't resolved, implicitly define it
                    if (!options.ignore.includes(name) && options.implicit(event.value)) {
                        const scope = scopes.at(-1);
                        if (scope != null) {
                            if (!scope.has(name)) scope.set(name, []);
                            scope.get(name)!.push(event.value);
                        }
                    }

                    break;
                }
                default: {
                    event satisfies never;
                }
            }
        });
    };
