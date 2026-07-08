import treesitterKotlinUrl from "@tree-sitter-grammars/tree-sitter-kotlin/tree-sitter-kotlin.wasm?url";
import { StreamLanguage } from "@codemirror/language";
import { kotlin as kotlinExtension } from "@codemirror/legacy-modes/mode/clike";
import { map, node, treesitterLanguage } from "@/compiler";
import * as features from "@/compiler/features";

const intType = features.makePrimitiveType("Int");
const doubleType = features.makePrimitiveType("Double");
const stringType = features.makePrimitiveType("String");
const booleanType = features.makePrimitiveType("Boolean");
const unitType = features.makePrimitiveType("Unit");

const functionType = features.makeFunctionType({
    display: (inputs, output) => `(${inputs.join(", ")}) -> ${output}`,
});

const listType = features.makeArrayType({
    display: (element) => `List<${element}>`,
});

const builtinTypes: features.BuiltinTypesOptions["types"] = {
    List: (parameters) => listType(parameters[0] ?? null),
};

const builtinFunctions: features.BuiltinFunctionsOptions["functions"] = {
    println: () => ({
        groups: [],
        overloads: [functionType([], unitType), functionType([null], unitType)],
    }),
    listOf: (inputs) => ({
        groups: [inputs], // all elements must have the same type
        overloads: [functionType(inputs, listType(inputs[0] ?? null))],
    }),
};

const builtinFields: features.BuiltinFieldsOptions["fields"] = {
    size: (field) => ({
        groups: [],
        overloads: [[[field, intType]]],
    }),
    map: (field, object, context) => {
        const element = context.temporary();
        const result = context.temporary();

        return {
            groups: [],
            overloads: [
                [
                    [object, listType(element)],
                    [field, functionType([functionType([element], result)], listType(result))],
                ],
            ],
        };
    },
    filter: (field, object, context) => {
        const element = context.temporary();

        return {
            groups: [],
            overloads: [
                [
                    [object, listType(element)],
                    [
                        field,
                        functionType([functionType([element], booleanType)], listType(element)),
                    ],
                ],
            ],
        };
    },
    fold: (field, object, context) => {
        const element = context.temporary();
        const result = context.temporary();

        return {
            groups: [],
            overloads: [
                [
                    [object, listType(element)],
                    [
                        field,
                        functionType([result, functionType([result, element], result)], result),
                    ],
                ],
            ],
        };
    },
    any: (field, object, context) => {
        const element = context.temporary();

        return {
            groups: [],
            overloads: [
                [
                    [object, listType(element)],
                    [field, functionType([functionType([element], booleanType)], booleanType)],
                ],
            ],
        };
    },
    all: (field, object, context) => {
        const element = context.temporary();

        return {
            groups: [],
            overloads: [
                [
                    [object, listType(element)],
                    [field, functionType([functionType([element], booleanType)], booleanType)],
                ],
            ],
        };
    },
};

export const kotlin = treesitterLanguage({
    name: "Kotlin",
    editorExtensions: [StreamLanguage.define(kotlinExtension)],
    treesitterUrl: treesitterKotlinUrl,
    features: [
        features.nameResolution({
            definitions: [
                map(node("property_declaration"), (node) => [
                    {
                        definition: node.children[0].children[0],
                        value: { identifier: node.children[1] },
                    },
                ]),
                map(node("assignment"), (node) => [
                    {
                        definition: node.children[0],
                        value: { identifier: node.children[1] },
                    },
                ]),
                map(node("function_value_parameters"), (node) =>
                    node.children.map((parameter) => ({ definition: parameter.children[0] })),
                ),
                map(node("function_declaration"), (node) => [{ definition: node.children[0] }]),
                map(node("class_declaration"), (node) => [
                    {
                        definition: node.children.find((node) => node.type === "identifier")!,
                        value: {
                            user_type: node,
                            identifier: node.children.find(
                                (node) => node.type === "primary_constructor",
                            )!,
                        },
                    },
                ]),
            ],
            scopes: [node("function_declaration"), node("for_statement"), node("block")],
            names: [node("identifier"), node("user_type")],
            ignore: [
                ...Object.keys(builtinFunctions),
                ...Object.keys(builtinFields),
                ...Object.keys(builtinTypes),
            ],
        }),
        features.replace({
            replace: [
                map(node("callable_reference"), (node) => [node, node.children[0]]),
                // Negative number literals
                map(node("unary_expression"), (node) =>
                    node.children[0].type === "number_literal" ||
                    node.children[0].type === "float_literal"
                        ? [node.children[0], undefined]
                        : undefined,
                ),
            ],
        }),
        features.builtinLiterals({
            literals: [
                [node("string_literal"), stringType],
                [node("number_literal"), intType],
                [node("float_literal"), doubleType],
                [
                    map(node("identifier"), (node) =>
                        node.text === "true" || node.text === "false" ? node : undefined,
                    ),
                    booleanType,
                ],
                [
                    map(node("identifier"), (node) => (node.text === "null" ? node : undefined)),
                    null,
                ],
                [node("range_expression"), listType(intType)],
            ],
        }),
        features.builtinTypes({
            type: [node("user_type")],
            name: (node) => node.children[0].text,
            parameters: (node) =>
                (node.children[1]?.children ?? []).map((parameter) => parameter.children[0]),
            types: builtinTypes,
        }),
        features.builtinFunctions({
            call: [node("call_expression")],
            function: (node) => [node.children[0], node.children[0].text],
            inputs: (node) => node.children[1].children.map((node) => node.children[0]),
            functions: builtinFunctions,
        }),
        features.builtinFields({
            fieldAccess: [node("navigation_expression")],
            object: (node) => node.children[0],
            field: (node) => node.children[1],
            fields: builtinFields,
        }),
        features.builtinBinaryOperators({
            operator: [
                map(node("binary_expression"), (node) => [
                    node.children[0],
                    node.components[1] as string,
                    node.children[1],
                    node,
                ]),
            ],
            operators: {
                "+": (left, right, output, context) => {
                    const element = context.temporary();

                    return {
                        groups: [],
                        overloads: [
                            [
                                [left, intType],
                                [right, left],
                                [output, intType],
                            ],
                            [
                                [left, doubleType],
                                [right, left],
                                [output, doubleType],
                            ],
                            [
                                [left, stringType],
                                [right, left],
                                [output, stringType],
                            ],
                            [
                                [left, listType(element)],
                                [right, element],
                                [output, listType(element)],
                            ],
                        ],
                    };
                },
            },
        }),
        features.builtinMathOperators({
            operator: [
                map(node("binary_expression"), (node) => [
                    node.children[0],
                    node.components[1] as string,
                    node.children[1],
                    node,
                ]),
            ],
            operators: {
                "-": [intType, doubleType],
                "*": [intType, doubleType],
                "/": [intType, doubleType],
                "%": [intType, doubleType],
                "**": [intType, doubleType],
            },
        }),
        features.builtinComparisonOperators({
            operator: [
                map(node("binary_expression"), (node) => [
                    node.children[0],
                    node.components[1] as string,
                    node.children[1],
                    node,
                ]),
            ],
            operators: ["==", "!=", "<", "<=", ">", ">="],
            comparisonTypes: [intType, doubleType, stringType, booleanType],
            booleanType,
        }),
        features.builtinLogicOperators({
            operator: [
                map(node("binary_expression"), (node) => [
                    node.children[0],
                    node.components[1] as string,
                    node.children[1],
                    node,
                ]),
                map(node("infix_expression"), (node) => [
                    node.children[0],
                    node.components[1] as string,
                    node.children[1],
                    node,
                ]),
            ],
            operators: ["&&", "||", "and", "or"],
            booleanType,
        }),
        features.functions({
            function: [
                map(node("function_declaration"), (node) => ({
                    function: node,
                    definition: node.children[0],
                    inputs: node.children[1].children.map((parameter) => parameter.children[0]),
                    output:
                        node.children.at(-1)?.type === "function_body"
                            ? node.children.length > 3
                                ? node.children.at(-2)
                                : undefined
                            : node.children[2],
                })),
            ],
            returnValue: [map(node("return_expression"), (node) => node.children[0])],
            functionType,
            voidType: unitType,
        }),
        features.functionCalls({
            call: [
                map(node("call_expression"), (callNode) => ({
                    function: callNode.children[0],
                    inputs: callNode.children[1].children.map((node) => node.children[0]),
                    call: callNode,
                })),
            ],
            functionType,
        }),
        features.fields({
            field: [
                map(node("navigation_expression"), (node) => ({
                    object: node.children[0],
                    field: node.children[1],
                    access: node,
                })),
            ],
        }),
        features.arrays({
            array: [
                map(node("collection_literal"), (node) => ({
                    array: node,
                    elements: node.children,
                })),
            ],
            arrayType: listType,
        }),
        features.arrayIndexes({
            indexes: [
                map(node("index_expression"), (node) => ({
                    array: node.children[0],
                    index: node.children[1],
                    element: node,
                })),
            ],
            arrayType: listType,
            indexType: intType,
        }),
        features.ifExpression({
            if: [
                map(node("if_expression"), (node) => ({
                    condition: node.children[0],
                    then: node.children[1],
                    else: node.children[2],
                    output: node,
                })),
            ],
            booleanType: booleanType,
        }),
        features.typeAnnotations({
            typeAnnotation: [
                map(node("parameter"), (parameter) => ({
                    value: parameter.children[0],
                    annotatedType: parameter.children[1],
                    annotation: parameter,
                })),
                map(node("class_parameter"), (parameter) => ({
                    value: parameter.children[0],
                    annotatedType: parameter.children[1],
                    annotation: parameter,
                })),
                map(node("property_declaration"), (assignment) => ({
                    value: assignment.children[0].children[0],
                    annotatedType: assignment.children[0].children[1],
                    annotation: assignment.children[0],
                })),
            ],
            type: [
                map(node("user_type"), (node) => (node.children.length === 1 ? node : undefined)),
                node("integral_type"),
                node("floating_point_type"),
                node("boolean_type"),
                node("void_type"),
            ],
        }),
        features.forEachLoops({
            forEachLoop: [
                map(node("for_statement"), (node) => ({
                    array: node.children[1],
                    element: node.children[0].children[0],
                    loop: node,
                })),
            ],
            arrayType: listType,
        }),
        features.typeDefinitions({
            typeDefinitions: [
                map(node("class_declaration"), (node) => {
                    const constructor = node.children.find(
                        (node) => node.type === "primary_constructor",
                    );

                    return {
                        definition: node,
                        constructors:
                            constructor != null
                                ? [
                                      {
                                          node: constructor,
                                          parameters: constructor.children[0].children.map(
                                              (parameter) => parameter.children[0],
                                          ),
                                      },
                                  ]
                                : [],
                    };
                }),
            ],
            type: (node) => {
                const interfaceNode = node.children.find(
                    (node) => node.type === "delegation_specifiers",
                )?.children[0]?.children[0];

                if (interfaceNode != null) {
                    return interfaceNode;
                }

                const name = node.children.find((node) => node.type === "identifier")!.text;
                return features.makeNamedType({ display: (name) => name })(name, []);
            },
            functionType,
        }),
    ],
});
