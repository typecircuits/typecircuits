import { Node, type ConstructedType, type Feature, type Selector, type Type } from "../index";

export interface TypeDefinitionsOptions {
    typeDefinitions: Selector<{
        definition: Node;
        constructors: { node: Node; parameters: Node[] }[];
    }>[];
    type: (definition: Node) => Type;
    functionType: (inputs: Type[], output: Type) => ConstructedType;
}

export const typeDefinitions =
    (options: TypeDefinitionsOptions): Feature =>
    (context) => {
        context.select(options.typeDefinitions, ({ definition, constructors }) => {
            const type = options.type(definition);
            context.replace(definition, undefined);
            context.type(definition, type);

            for (const constructor of constructors) {
                context.type(
                    constructor.node,
                    options.functionType(constructor.parameters, definition),
                );

                for (const parameter of constructor.parameters) {
                    context.edge(parameter, constructor.node, "input");
                }
            }
        });
    };
