import { Node, type ConstructedType, type Feature, type Selector, type Type } from "../index";

export interface ForEachLoopsOptions {
    forEachLoop: Selector<{ array: Node; element: Node; loop: Node }>[];
    arrayType: (element: Type) => ConstructedType;
}

export const forEachLoops =
    (options: ForEachLoopsOptions): Feature =>
    (context) => {
        context.select(options.forEachLoop, ({ array, element, loop }) => {
            context.edge(array, loop, "array");
            context.edge(array, element, "element");
            context.type(array, options.arrayType(element));
        });
    };
