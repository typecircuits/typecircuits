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
                        definition: node.children[0],
                        value: { identifier: node.children[1] },
                    },
                ]),
                map(node("assignment_expression"), (node) => [
                    {
                        definition: node.children[0],
                        value: { identifier: node.children[1] },
                    },
                ]),
                map(node("formal_parameters"), (node) =>
                    node.children.map((parameter) => ({ definition: parameter })),
                ),
                map(node("function_declaration"), (node) => [{ definition: node.children[0] }]),
            ],
            scopes: [node("function_declaration"), node("arrow_function"), node("for_statement")],
            names: [node("identifier"), node("member_expression")],
            ignore: Object.keys(builtinFunctions),
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
            function: (node) => [node.children[0], node.children[0].text],
            inputs: (node) => node.children[1].children,
            functions: builtinFunctions,
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
                    node.children[0],
                    node.components[1] as string,
                    node.children[1],
                    node,
                ]),
            ],
            operators: ["==", "!=", "===", "!==", "<", "<=", ">", ">="],
            comparisonTypes: [numberType, stringType, booleanType],
            booleanType: booleanType,
        }),
        features.builtinLogicOperators({
            operator: [
                map(node("binary_expression"), (node) => [
                    node.children[0],
                    node.components[1] as string,
                    node.children[1],
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
                    definition: node.children[0],
                    inputs: node.children[1].children,
                })),
                map(node("function_expression"), (node) => ({
                    function: node,
                    inputs: node.children[0].children,
                })),
                map(node("arrow_function"), (node) => ({
                    function: node,
                    inputs: node.children[0].children,
                    output:
                        node.children[1].type !== "statement_block" ? node.children[1] : undefined,
                })),
            ],
            returnValue: [map(node("return_statement"), (node) => node.children[0])],
            functionType,
            voidType,
        }),
        features.functionCalls({
            call: [
                map(node("call_expression"), (callNode) => ({
                    function: callNode.children[0],
                    inputs: callNode.children[1].children,
                    call: callNode,
                })),
            ],
            functionType,
        }),
        features.arrays({
            array: [
                map(node("array"), (node) => ({
                    array: node,
                    elements: node.children,
                })),
            ],
            arrayType: listType,
        }),
        features.arrayIndexes({
            indexes: [
                map(node("subscript_expression"), (node) => ({
                    array: node.children[0],
                    index: node.children[1],
                    element: node,
                })),
            ],
            arrayType: listType,
            indexType: numberType,
        }),
        features.ifExpression({
            if: [
                map(node("if_statement"), (node) => ({
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
                map(node("ternary_expression"), (node) => ({
                    condition: node.children[0],
                    then: node.children[1],
                    else: node.children[2],
                    output: node,
                })),
            ],
            booleanType,
        }),
        features.forEachLoops({
            forEachLoop: [
                map(node("for_in_statement"), (node) => ({
                    array: node.children[1],
                    element: node.children[0],
                    loop: node,
                })),
            ],
            arrayType: listType,
        }),
        features.updates({
            update: [
                map(node("update_expression"), (node) => ({
                    value: node.children[0],
                    update: node,
                })),
            ],
            numberType,
        }),
    ],
});
