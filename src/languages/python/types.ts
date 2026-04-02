import type { Node } from "@/compiler/lower/node";
import { type, type Type } from "@/compiler/typecheck/type";

const functionType = (inputs: Type[], output: Type) =>
    type({
        tag: functionType,
        children: [output, ...inputs],
        display: ([output, ...inputs], root) => {
            const result = `(${inputs.join(", ")}) -> ${output}`;
            return root ? result : `(${result})`;
        },
        isFunction: true,
    });

export { functionType as function };

export const list = (element: Type) =>
    type({
        tag: list,
        children: [element],
        display: ([element]) => `list[${element}]`,
    });

export const named = (name: Node, parameters: Type[], displayName?: string) =>
    type({
        tag: name,
        children: parameters,
        display: (parameters) => {
            if (parameters.length === 0) {
                return displayName ?? name.span.source;
            } else {
                return `${displayName ?? name.span.source}[${parameters.join(", ")}]`;
            }
        },
    });

const primitive = (name: string) => {
    const primitive = () =>
        type({
            tag: primitive,
            children: [],
            display: () => name,
        });

    return primitive();
};

export const int = primitive("int");

export const float = primitive("float");

export const str = primitive("str");

export const bool = primitive("bool");

export const none = primitive("None");
