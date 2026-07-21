import { Context, Node, type Feature, type Selector, type Type } from "../index";
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
            kind: "function",
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

export interface BuiltinTypesOptions {
    type: Selector<Node>[];
    name: (node: Node) => string;
    parameters: (node: Node) => Node[];
    types: Record<string, (parameters: Type[], context: Context) => ConstructedType>;
}

export const builtinTypes =
    (options: BuiltinTypesOptions): Feature =>
    (context) => {
        context.select(options.type, (type) => {
            const name = options.name(type);
            const parameters = options.parameters(type);

            if (name in options.types) {
                context.type(type, options.types[name](parameters, context));
            }
        });
    };

export interface BuiltinFunctionsOptions {
    call: Selector<{ function: [Node, string] | undefined; inputs: Node[] }>[];
    functions: Record<
        string,
        (inputs: Node[], context: Context) => { groups: Node[][]; overloads: ConstructedType[] }
    >;
}

export const builtinFunctions =
    (options: BuiltinFunctionsOptions): Feature =>
    (context) => {
        context.select(options.call, (callNode) => {
            const { function: [functionNode, functionName] = [], inputs } = callNode;

            if (functionNode != null && functionName != null && functionName in options.functions) {
                const { groups, overloads } = options.functions[functionName](inputs, context);

                for (const group of groups) {
                    context.group(...group);
                }

                context.overload(overloads.map((type) => [[functionNode, type]]));
            }
        });
    };

export interface BuiltinFieldsOptions {
    fieldAccess: Selector<Node>[];
    object: (node: Node) => Node;
    field: (node: Node) => Node;
    fields: Record<
        string,
        (
            fieldAccess: Node,
            object: Node,
            context: Context,
        ) => { groups: Node[][]; overloads: [Node, ConstructedType][][] }
    >;
}

export const builtinFields =
    (options: BuiltinFieldsOptions): Feature =>
    (context) => {
        context.select(options.fieldAccess, (fieldAccessNode) => {
            const object = options.object(fieldAccessNode);
            const field = options.field(fieldAccessNode);

            context.edge(object, fieldAccessNode, "object");

            if (field.text in options.fields) {
                const { groups, overloads } = options.fields[field.text](field, object, context);

                for (const group of groups) {
                    context.group(...group);
                }

                context.overload(overloads);
            }
        });
    };

export type BuiltinBinaryOperatorSelector = Selector<[Node, string, Node, Node]>;

export interface BuiltinBinaryOperatorsOptions {
    operator: BuiltinBinaryOperatorSelector[];
    operators: Record<
        string,
        (
            left: Node,
            right: Node,
            output: Node,
            context: Context,
        ) => { groups: Node[][]; overloads: [Node, Type][][] }
    >;
}

export const builtinBinaryOperators =
    (options: BuiltinBinaryOperatorsOptions): Feature =>
    (context) => {
        context.select(options.operator, ([left, operator, right, output]) => {
            if (operator in options.operators) {
                const { groups, overloads } = options.operators[operator](
                    left,
                    right,
                    output,
                    context,
                );

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
                    groups: [[left, right]],
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

export interface BuiltinEqualityOperatorsOptions {
    operator: BuiltinBinaryOperatorSelector[];
    operators: string[];
    booleanType: ConstructedType;
}

export const builtinEqualityOperators = (options: BuiltinEqualityOperatorsOptions) =>
    builtinBinaryOperators({
        operator: options.operator,
        operators: Object.fromEntries(
            options.operators.map((operator) => [
                operator,
                (left, right, output) => ({
                    groups: [[left, right]],
                    overloads: [[[output, options.booleanType]]],
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
