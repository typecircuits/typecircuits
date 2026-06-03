import treesitterKotlinUrl from "@tree-sitter-grammars/tree-sitter-kotlin/tree-sitter-kotlin.wasm?url";
import { StreamLanguage } from "@codemirror/language";
import { kotlin as kotlinExtension } from "@codemirror/legacy-modes/mode/clike";
import { node, treesitterLanguage } from "@/compiler";
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

const builtinFunctions: features.BuiltinFunctionsOptions["functions"] = {
    println: () => ({
        groups: [],
        overloads: [functionType([], unitType), functionType([null], unitType)],
    }),
    size: () => ({
        groups: [],
        overloads: [intType],
    }),
    listOf: (inputs) => ({
        groups: [inputs], // all elements must have the same type
        overloads: [functionType(inputs, listType(inputs[0] ?? null))],
    }),
};

export const kotlin = treesitterLanguage({
    name: "Kotlin",
    editorExtensions: [StreamLanguage.define(kotlinExtension)],
    treesitterUrl: treesitterKotlinUrl,
    features: [
        features.hideDefault(),
        features.hide({
            transparent: [
                node("source_file"),
                node("property_declaration"),
                node("variable_declaration"),
                node("expression_statement"),
                node("return_expression"),
                node("for_statement"),
                node("while_statement"),
                node("assignment"),
                node("function_value_parameters"),
                node("value_arguments"),
                node("value_argument"),
                node("function_body"),
                node("parenthesized_expression"),
                node("block"),
            ],
            atomic: [node("string_literal"), node("user_type"), node("range_expression")],
        }),
        features.nameResolution({
            definitions: [
                node("property_declaration", (node) => [
                    {
                        definition: node.children[0].children[0],
                        value: node.children[1],
                    },
                ]),
                node("assignment", (node) => [
                    {
                        definition: node.children[0],
                        value: node.children[1],
                    },
                ]),
                node("function_value_parameters", (node) =>
                    node.children.map((parameter) => ({ definition: parameter.children[0] })),
                ),
                node("function_declaration", (node) => [{ definition: node.children[0] }]),
            ],
            scopes: [node("function_declaration"), node("for_statement"), node("block")],
            names: [node("identifier")],
            ignore: Object.keys(builtinFunctions),
        }),
        features.builtinLiterals({
            literals: [
                [node("string_literal"), stringType],
                [node("number_literal"), intType],
                [node("float_literal"), doubleType],
                [
                    node("identifier", (node) =>
                        node.text === "true" || node.text === "false" ? node : undefined,
                    ),
                    booleanType,
                ],
                [node("identifier", (node) => (node.text === "null" ? node : undefined)), null],
                [node("range_expression"), listType(intType)],
            ],
        }),
        features.builtinFunctions({
            call: [node("call_expression")],
            function: (node) => [node.children[0], node.children[0].text],
            inputs: (node) => node.children[1].children.map((node) => node.children[0]),
            functions: builtinFunctions,
        }),
        features.builtinMathOperators({
            operator: [
                node("binary_expression", (node) => [
                    node.children[0],
                    node.components[1] as string,
                    node.children[1],
                    node,
                ]),
            ],
            operators: {
                "+": [intType, doubleType, stringType],
                "-": [intType, doubleType],
                "*": [intType, doubleType],
                "/": [intType, doubleType],
                "%": [intType, doubleType],
                "**": [intType, doubleType],
            },
        }),
        features.builtinComparisonOperators({
            operator: [
                node("binary_expression", (node) => [
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
                node("binary_expression", (node) => [
                    node.children[0],
                    node.components[1] as string,
                    node.children[1],
                    node,
                ]),
                node("infix_expression", (node) => [
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
                node("function_declaration", (node) => ({
                    function: node,
                    definition: node.children[0],
                    inputs: node.children[1].children,
                    output: node.children[2],
                })),
            ],
            returnValue: [node("return_expression", (node) => node.children[0])],
            functionType,
            voidType: unitType,
        }),
        features.functionCalls({
            call: [
                node("call_expression", (callNode) => ({
                    function: callNode.children[0],
                    inputs: callNode.children[1].children.map((node) => node.children[0]),
                    call: callNode,
                })),
            ],
            functionType,
        }),
        features.fields({
            field: [
                node("navigation_expression", (node) => ({
                    object: node.children[0],
                    field: node.children[1],
                    access: node,
                })),
            ],
        }),
        features.arrays({
            array: [
                node("collection_literal", (node) => ({
                    array: node,
                    elements: node.children,
                })),
            ],
            arrayType: listType,
        }),
        features.arrayIndexes({
            indexes: [
                node("index_expression", (node) => ({
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
                node("if_expression", (node) => ({
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
                node("parameter", (parameter) => ({
                    value: parameter.children[0],
                    annotatedType: parameter.children[1],
                    annotation: parameter,
                })),
                node("property_declaration", (assignment) => ({
                    value: assignment.children[0].children[0],
                    annotatedType: assignment.children[0].children[1],
                    annotation: assignment.children[0],
                })),
            ],
            type: [
                node("user_type"),
                node("integral_type"),
                node("floating_point_type"),
                node("boolean_type"),
                node("void_type"),
            ],
        }),
        features.forEachLoops({
            forEachLoop: [
                node("for_statement", (node) => ({
                    array: node.children[1],
                    element: node.children[0].children[0],
                    loop: node,
                })),
            ],
            arrayType: listType,
            voidType: unitType,
        }),
    ],
});
