import treesitterPythonUrl from "tree-sitter-python/tree-sitter-python.wasm?url";
import { python as pythonExtension } from "@codemirror/lang-python";
import { map, node, treesitterLanguage } from "@/compiler";
import * as features from "@/compiler/features";

const intType = features.makePrimitiveType("int");
const floatType = features.makePrimitiveType("float");
const strType = features.makePrimitiveType("str");
const boolType = features.makePrimitiveType("bool");
const noneType = features.makePrimitiveType("None");

const functionType = features.makeFunctionType({
    display: (inputs, output) => `(${inputs.join(", ")}) -> ${output}`,
});

const listType = features.makeArrayType({
    display: (element) => `list[${element}]`,
});

const builtinFunctions: features.BuiltinFunctionsOptions["functions"] = {
    print: () => ({
        groups: [],
        overloads: [functionType([], noneType), functionType([null], noneType)],
    }),
    len: () => ({
        groups: [],
        overloads: [functionType([null], intType)],
    }),
    randint: () => ({
        groups: [],
        overloads: [functionType([], intType)],
    }),
    range: () => ({
        groups: [],
        overloads: [functionType([intType], listType(intType))],
    }),
    str: () => ({
        groups: [],
        overloads: [functionType([null], strType)],
    }),
    int: () => ({
        groups: [],
        overloads: [functionType([null], intType)],
    }),
    float: () => ({
        groups: [],
        overloads: [functionType([null], floatType)],
    }),
    bool: () => ({
        groups: [],
        overloads: [functionType([null], boolType)],
    }),
};

export const python = treesitterLanguage({
    name: "Python",
    editorExtensions: [pythonExtension()],
    treesitterUrl: treesitterPythonUrl,
    features: [
        features.nameResolution({
            definitions: [
                map(node("assignment"), (node) => [
                    {
                        definition: node.child("left")!,
                        value: { identifier: node.child("right")! }, // handle type annotations
                    },
                ]),
                map(node("parameters"), (node) =>
                    node.children().map((parameter) => ({ definition: parameter })),
                ),
                map(node("function_definition"), (node) => [{ definition: node.child("name")! }]),
            ],
            scopes: [node("function_definition"), node("for_statement")],
            names: [node("identifier")],
            ignore: Object.keys(builtinFunctions),
            implicit: () => true,
        }),
        features.builtinLiterals({
            literals: [
                [node("string"), strType],
                [node("integer"), intType],
                [node("float"), floatType],
                [node("true"), boolType],
                [node("false"), boolType],
                [node("none"), noneType],
            ],
        }),
        features.builtinFunctions({
            call: [node("call")],
            function: (node) => [node.child("function")!, node.child("function")!.text],
            inputs: (node) => node.child("arguments")!.children(),
            functions: builtinFunctions,
        }),
        features.builtinMathOperators({
            operator: [
                map(node("binary_operator"), (node) => [
                    node.child("left")!,
                    node.string("operator")!,
                    node.child("right")!,
                    node,
                ]),
            ],
            operators: {
                "+": [intType, floatType, strType],
                "-": [intType, floatType],
                "*": [intType, floatType],
                "/": [intType, floatType],
                "%": [intType, floatType],
                "**": [intType, floatType],
            },
        }),
        features.builtinComparisonOperators({
            operator: [
                map(node("comparison_operator"), (node) => [
                    node.children()[0],
                    node.string("operators")!,
                    node.children()[1],
                    node,
                ]),
            ],
            operators: ["<", "<=", ">", ">="],
            comparisonTypes: [intType, floatType, strType, boolType],
            booleanType: boolType,
        }),
        features.builtinEqualityOperators({
            operator: [
                map(node("comparison_operator"), (node) => [
                    node.children()[0],
                    node.string("operators")!,
                    node.children()[1],
                    node,
                ]),
            ],
            operators: ["==", "!="],
            booleanType: boolType,
        }),
        features.builtinLogicOperators({
            operator: [
                map(node("boolean_operator"), (node) => [
                    node.child("left")!,
                    node.string("operator")!,
                    node.child("right")!,
                    node,
                ]),
            ],
            operators: ["and", "or"],
            booleanType: boolType,
        }),
        features.functions({
            function: [
                map(node("function_definition"), (node) => ({
                    function: node,
                    definition: node.child("name")!,
                    inputs: node.child("parameters")!.children(),
                    output: node.child("return_type"),
                })),
            ],
            returnValue: [map(node("return_statement"), (node) => node.children()[0])],
            functionType,
            voidType: noneType,
        }),
        features.functionCalls({
            call: [
                map(node("call"), (callNode) => ({
                    function: callNode.child("function")!,
                    inputs: callNode.child("arguments")!.children(),
                    call: callNode,
                })),
            ],
            functionType,
        }),
        features.arrays({
            array: [
                map(node("list"), (node) => ({
                    array: node,
                    elements: node.children(),
                })),
            ],
            arrayType: listType,
        }),
        features.arrayIndexes({
            indexes: [
                map(node("subscript"), (node) => ({
                    array: node.child("value")!,
                    index: node.child("subscript")!,
                    element: node,
                })),
            ],
            arrayType: listType,
            indexType: intType,
        }),
        features.ifExpression({
            if: [
                map(node("if_statement"), (node) => ({
                    condition: node.child("condition")!,
                    // Treat single-statement `if` branches as values
                    then:
                        node.child("consequence")!.children().length === 1
                            ? node.child("consequence")!.children()[0].children()[0]
                            : undefined,
                    else:
                        node.child("alternative")?.children()[0].children().length === 1
                            ? node.child("alternative")!.children()[0].children()[0].children()[0]
                            : undefined,
                    output: node,
                })),
                map(node("conditional_expression"), (node) => ({
                    condition: node.children()[1],
                    then: node.children()[0],
                    else: node.children()[2],
                    output: node,
                })),
            ],
            booleanType: boolType,
        }),
        features.typeAnnotations({
            typeAnnotation: [
                map(node("typed_parameter"), (parameter) => ({
                    value: parameter.children()[0],
                    annotatedType: parameter.child("type")!,
                    annotation: parameter,
                })),
                map(node("assignment"), (assignment) => ({
                    value: assignment.child("left")!,
                    annotatedType: assignment.child("type"),
                    annotation: assignment,
                })),
            ],
            type: [node("type")],
        }),
        features.forEachLoops({
            forEachLoop: [
                map(node("for_statement"), (node) => ({
                    array: node.child("right")!,
                    element: node.child("left")!,
                    loop: node,
                })),
            ],
            arrayType: listType,
        }),
    ],
});
