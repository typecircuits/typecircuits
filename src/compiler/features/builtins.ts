import { Node, type Feature, type Selector, type Type } from "../index";
import { constructedType, type ConstructedType } from "../solver/type";

export const makePrimitiveType = (name: string) =>
    constructedType({
        tag: name,
        children: [],
        display: () => name,
    });

export const makeNamedType =
    (options: { display: (name: string, parameters: string[]) => string }) =>
    (name: string, parameters: Type[]) =>
        constructedType({
            tag: name,
            children: parameters,
            display: (parameters) => options.display(name, parameters),
        });

export const makeFunctionType =
    (options: { display: (inputs: string[], output: string, root: boolean) => string }) =>
    (inputs: Type[], output: Type) =>
        constructedType({
            tag: "function",
            children: [output, ...inputs],
            display: ([output, ...inputs], root) => options.display(inputs, output, root),
        });

export const makeArrayType =
    (options: { display: (element: string) => string }) => (element: Type) =>
        constructedType({
            tag: "array",
            children: [element],
            display: ([element]) => options.display(element),
        });

export interface BuiltinLiteralsOptions {
    literals: [Selector<Node>, Type][];
}

export const builtinLiterals =
    (options: BuiltinLiteralsOptions): Feature =>
    (context) => {
        const literalSelectors = options.literals.map(
            ([selector, type]): Selector<[Node, Type]> =>
                (node, callback) =>
                    selector(node, (node) => callback([node, type])),
        );

        context.select(literalSelectors, ([node, type]) => {
            context.type(node, type);
        });
    };

export interface BuiltinFunctionsOptions {
    call: Selector<Node>[];
    function: (node: Node) => [Node, string] | undefined;
    functions: Record<string, { groups: Node[][]; overloads: ConstructedType[] }>;
}

export const builtinFunctions =
    (options: BuiltinFunctionsOptions): Feature =>
    (context) => {
        context.select(options.call, (callNode) => {
            const [functionNode, functionName] = options.function(callNode) ?? [];

            if (functionNode != null && functionName != null && functionName in options.functions) {
                const { groups, overloads } = options.functions[functionName];

                for (const group of groups) {
                    context.group(...group);
                }

                context.overload(overloads.map((type) => [[functionNode, type]]));
            }
        });
    };

export type BuiltinBinaryOperatorSelector = Selector<[Node, string, Node, Node]>;

export interface BuiltinBinaryOperatorsOptions {
    operator: BuiltinBinaryOperatorSelector[];
    operators: Record<
        string,
        (left: Node, right: Node, output: Node) => { groups: Node[][]; overloads: [Node, Type][][] }
    >;
}

export const builtinBinaryOperators =
    (options: BuiltinBinaryOperatorsOptions): Feature =>
    (context) => {
        context.select(options.operator, ([left, operator, right, output]) => {
            if (operator in options.operators) {
                const { groups, overloads } = options.operators[operator](left, right, output);

                for (const group of groups) {
                    context.group(...group);
                }

                context.overload(overloads);

                context.edge(left, output, "left");
                context.edge(right, output, "right");
            }
        });
    };

export interface BuiltinMathOperatorsOptions {
    operator: BuiltinBinaryOperatorSelector[];
    operators: Record<string, ConstructedType[]>;
}

export const builtinMathOperators = (options: BuiltinMathOperatorsOptions) =>
    builtinBinaryOperators({
        operator: options.operator,
        operators: Object.fromEntries(
            Object.entries(options.operators).map(([operator, types]) => [
                operator,
                (left, right, output) => ({
                    groups: [],
                    overloads: types.map((type) => [
                        [left, type],
                        [right, type],
                        [output, type],
                    ]),
                }),
            ]),
        ),
    });

export interface BuiltinComparisonOperatorsOptions {
    operator: BuiltinBinaryOperatorSelector[];
    operators: string[];
    comparisonTypes: ConstructedType[];
    booleanType: ConstructedType;
}

export const builtinComparisonOperators = (options: BuiltinComparisonOperatorsOptions) =>
    builtinBinaryOperators({
        operator: options.operator,
        operators: Object.fromEntries(
            options.operators.map((operator) => [
                operator,
                (left, right, output) => ({
                    groups: [[left, right]],
                    overloads: options.comparisonTypes.map((type) => [
                        [left, type],
                        [output, options.booleanType],
                    ]),
                }),
            ]),
        ),
    });

export interface BuiltinLogicOperatorsOptions {
    operator: BuiltinBinaryOperatorSelector[];
    operators: string[];
    booleanType: ConstructedType;
}

export const builtinLogicOperators = (options: BuiltinLogicOperatorsOptions) =>
    builtinBinaryOperators({
        operator: options.operator,
        operators: Object.fromEntries(
            options.operators.map((operator) => [
                operator,
                (left, right, output) => ({
                    groups: [[left, right]],
                    overloads: [
                        [
                            [left, options.booleanType],
                            [output, options.booleanType],
                        ],
                    ],
                }),
            ]),
        ),
    });
