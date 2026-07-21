import treesitterJavascriptUrl from "tree-sitter-javascript/tree-sitter-javascript.wasm?url";
import { javascript as javascriptExtension } from "@codemirror/lang-javascript";
import { map, node, treesitterLanguage } from "@/compiler";
import * as features from "@/compiler/features";

const numberType = features.makePrimitiveType("number");
const stringType = features.makePrimitiveType("string");
const booleanType = features.makePrimitiveType("boolean");
const nullType = features.makePrimitiveType("null");
const voidType = features.makePrimitiveType("void");

const functionType = features.makeFunctionType({
    display: (inputs, output) => `(${inputs.join(", ")}) => ${output}`,
});

const listType = features.makeArrayType({
    display: (element) => `${element}[]`,
});

const builtinFunctions: features.BuiltinFunctionsOptions["functions"] = {
    "console.log": () => ({
        groups: [],
        overloads: [functionType([], voidType), functionType([null], voidType)],
    }),
    "Math.random": () => ({
        groups: [],
        overloads: [functionType([], numberType)],
    }),
    String: () => ({
        groups: [],
        overloads: [functionType([null], stringType)],
    }),
    Number: () => ({
        groups: [],
        overloads: [functionType([null], numberType)],
    }),
    Boolean: () => ({
        groups: [],
        overloads: [functionType([null], booleanType)],
    }),
};

export const javascript = treesitterLanguage({
    name: "JavaScript",
    editorExtensions: [javascriptExtension()],
    treesitterUrl: treesitterJavascriptUrl,
    features: [
        features.nameResolution({
            definitions: [
                map(node("variable_declarator"), (node) => [
                    {
                        definition: node.child("name")!,
                        value: { identifier: node.child("value")! },
                    },
                ]),
                map(node("assignment_expression"), (node) => [
                    {
                        definition: node.child("left")!,
                        value: { identifier: node.child("right")! },
                    },
                ]),
                map(node("formal_parameters"), (node) =>
                    node.children().map((parameter) => ({ definition: parameter })),
                ),
                map(node("function_declaration"), (node) => [{ definition: node.child("name")! }]),
            ],
            scopes: [node("function_declaration"), node("arrow_function"), node("for_statement")],
            names: [node("identifier"), node("member_expression")],
            ignore: Object.keys(builtinFunctions),
            implicit: () => true,
        }),
        features.builtinLiterals({
            literals: [
                [node("string"), stringType],
                [node("number"), numberType],
                [node("true"), booleanType],
                [node("false"), booleanType],
                [node("null"), nullType],
                [node("undefined"), voidType],
            ],
        }),
        features.builtinFunctions({
            call: [node("call_expression")],
            function: (node) => [node.child("function")!, node.child("function")!.text],
            inputs: (node) => node.child("arguments")!.children(),
            functions: builtinFunctions,
        }),
        features.builtinMathOperators({
            operator: [
                map(node("binary_expression"), (node) => [
                    node.child("left")!,
                    node.string("operator")!,
                    node.child("right")!,
                    node,
                ]),
            ],
            operators: {
                "+": [numberType, stringType],
                "-": [numberType],
                "*": [numberType],
                "/": [numberType],
                "%": [numberType],
                "**": [numberType],
            },
        }),
        features.builtinComparisonOperators({
            operator: [
                map(node("binary_expression"), (node) => [
                    node.child("left")!,
                    node.string("operator")!,
                    node.child("right")!,
                    node,
                ]),
            ],
            operators: ["<", "<=", ">", ">="],
            comparisonTypes: [numberType, stringType, booleanType],
            booleanType: booleanType,
        }),
        features.builtinEqualityOperators({
            operator: [
                map(node("binary_expression"), (node) => [
                    node.child("left")!,
                    node.string("operator")!,
                    node.child("right")!,
                    node,
                ]),
            ],
            operators: ["==", "!=", "===", "!=="],
            booleanType: booleanType,
        }),
        features.builtinLogicOperators({
            operator: [
                map(node("binary_expression"), (node) => [
                    node.child("left")!,
                    node.string("operator")!,
                    node.child("right")!,
                    node,
                ]),
            ],
            operators: ["&&", "||"],
            booleanType: booleanType,
        }),
        features.functions({
            function: [
                map(node("function_declaration"), (node) => ({
                    function: node,
                    definition: node.child("name")!,
                    inputs: node.child("parameters")!.children(),
                })),
                map(node("function_expression"), (node) => ({
                    function: node,
                    inputs: node.child("parameters")!.children(),
                })),
                map(node("arrow_function"), (node) => ({
                    function: node,
                    inputs: node.child("parameters")?.children() ?? [node.child("parameter")!],
                    output:
                        node.child("body")!.type !== "statement_block"
                            ? node.child("body")!
                            : undefined,
                })),
            ],
            returnValue: [map(node("return_statement"), (node) => node.children()[0])],
            functionType,
            voidType,
        }),
        features.functionCalls({
            call: [
                map(node("call_expression"), (callNode) => ({
                    function: callNode.child("function")!,
                    inputs: callNode.child("arguments")!.children(),
                    call: callNode,
                })),
            ],
            functionType,
        }),
        features.arrays({
            array: [
                map(node("array"), (node) => ({
                    array: node,
                    elements: node.children(),
                })),
            ],
            arrayType: listType,
        }),
        features.arrayIndexes({
            indexes: [
                map(node("subscript_expression"), (node) => ({
                    array: node.child("object")!,
                    index: node.child("index")!,
                    element: node,
                })),
            ],
            arrayType: listType,
            indexType: numberType,
        }),
        features.ifExpression({
            if: [
                map(node("if_statement"), (node) => ({
                    condition: node.child("condition")!,
                    // Treat single-statement `if` branches as values
                    then:
                        node.child("consequence")!.children().length === 1
                            ? node.child("consequence")!.children()[0]
                            : undefined,
                    else:
                        node.child("alternative")?.children().length === 1
                            ? node.child("alternative")!.children()[0]
                            : undefined,
                    output: node,
                })),
                map(node("ternary_expression"), (node) => ({
                    condition: node.child("condition")!,
                    then: node.child("consequence")!,
                    else: node.child("alternative")!,
                    output: node,
                })),
            ],
            booleanType,
        }),
        features.forEachLoops({
            forEachLoop: [
                map(node("for_in_statement"), (node) => ({
                    array: node.child("right")!,
                    element: node.child("left")!,
                    loop: node,
                })),
            ],
            arrayType: listType,
        }),
        features.updates({
            update: [
                map(node("update_expression"), (node) => ({
                    value: node.child("argument")!,
                    update: node,
                })),
            ],
            numberType,
        }),
    ],
});
