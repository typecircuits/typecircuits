import treesitterPythonUrl from "tree-sitter-python/tree-sitter-python.wasm?url";
import { python as pythonExtension } from "@codemirror/lang-python";
import { node, treesitterLanguage } from "@/compiler";
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
                node("assignment", (node) => [
                    {
                        definition: node.children[0],
                        value: node.children.at(-1), // handle type annotations
                    },
                ]),
                node("parameters", (node) =>
                    node.children.map((parameter) => ({ definition: parameter })),
                ),
                node("function_definition", (node) => [{ definition: node.children[0] }]),
            ],
            scopes: [node("function_definition"), node("for_statement")],
            names: [node("identifier")],
            ignore: Object.keys(builtinFunctions),
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
            function: (node) => [node.children[0], node.children[0].text],
            inputs: (node) => node.children[1].children,
            functions: builtinFunctions,
        }),
        features.builtinMathOperators({
            operator: [
                node("binary_operator", (node) => [
                    node.children[0],
                    node.components[1] as string,
                    node.children[1],
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
                node("comparison_operator", (node) => [
                    node.children[0],
                    node.components[1] as string,
                    node.children[1],
                    node,
                ]),
            ],
            operators: ["==", "!=", "<", "<=", ">", ">="],
            comparisonTypes: [intType, floatType, strType, boolType],
            booleanType: boolType,
        }),
        features.builtinLogicOperators({
            operator: [
                node("boolean_operator", (node) => [
                    node.children[0],
                    node.components[1] as string,
                    node.children[1],
                    node,
                ]),
            ],
            operators: ["and", "or"],
            booleanType: boolType,
        }),
        features.functions({
            function: [
                node("function_definition", (node) => ({
                    function: node,
                    definition: node.children[0],
                    inputs: node.children[1].children,
                })),
            ],
            returnValue: [node("return_statement", (node) => node.children[0])],
            functionType,
            voidType: noneType,
        }),
        features.functionCalls({
            call: [
                node("call", (callNode) => ({
                    function: callNode.children[0],
                    inputs: callNode.children[1].children,
                    call: callNode,
                })),
            ],
            functionType,
        }),
        features.arrays({
            array: [
                node("list", (node) => ({
                    array: node,
                    elements: node.children,
                })),
            ],
            arrayType: listType,
        }),
        features.arrayIndexes({
            indexes: [
                node("subscript", (node) => ({
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
                node("if_statement", (node) => ({
                    condition: node.children[0],
                    // Treat single-statement `if` branches as values
                    then:
                        node.children[1].children.length === 1
                            ? node.children[1].children[0].children[0]
                            : undefined,
                    else:
                        node.children[2]?.children[0].children.length === 1
                            ? node.children[2].children[0].children[0].children[0]
                            : undefined,
                    output: node,
                })),
                node("conditional_expression", (node) => ({
                    condition: node.children[1],
                    then: node.children[0],
                    else: node.children[2],
                    output: node,
                })),
            ],
            booleanType: boolType,
        }),
        features.typeAnnotations({
            typeAnnotation: [
                node("typed_parameter", (parameter) => ({
                    value: parameter.children[0],
                    annotatedType: parameter.children[1],
                    annotation: parameter,
                })),
                node("assignment", (assignment) => ({
                    value: assignment.children[0],
                    annotatedType:
                        assignment.children.length > 2 ? assignment.children[1] : undefined,
                    annotation: assignment,
                })),
            ],
            type: [node("type")],
        }),
        features.forEachLoops({
            forEachLoop: [
                node("for_statement", (node) => ({
                    array: node.children[1],
                    element: node.children[0],
                    loop: node,
                })),
            ],
            arrayType: listType,
        }),
    ],
});
