import { Node, type ConstructedType, type Feature, type Selector, type Type } from "../index";

export interface ArraysOptions {
    array: Selector<{ array: Node; elements: Node[] }>[];
    arrayType: (element: Type) => ConstructedType;
}

export const arrays =
    (options: ArraysOptions): Feature =>
    (context) => {
        context.select(options.array, ({ array, elements }) => {
            for (const element of elements) {
                context.edge(element, array, "element");
            }

            const [representative, ...rest] = elements;

            if (representative == null) {
                context.type(array, options.arrayType(null));
            } else {
                context.type(array, options.arrayType(representative));
                for (const element of rest) {
                    context.group(element, representative);
                }
            }
        });
    };

export interface ArrayIndexesOptions {
    indexes: Selector<{ array: Node; index: Node; element: Node }>[];
    arrayType: (element: Type) => ConstructedType;
    indexType: ConstructedType;
}

export const arrayIndexes =
    (options: ArrayIndexesOptions): Feature =>
    (context) => {
        context.select(options.indexes, ({ array, index, element }) => {
            context.edge(array, element, "array");
            context.type(index, options.indexType);

            context.edge(index, element, "index");
            context.type(array, options.arrayType(element));
        });
    };
