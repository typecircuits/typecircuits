import treesitterCsharpExtension from "tree-sitter-c-sharp/tree-sitter-c_sharp.wasm?url";
import { csharp as csharpExtension } from "@replit/codemirror-lang-csharp";
import { map, node, treesitterLanguage } from "@/compiler";
import * as features from "@/compiler/features";

const intType = features.makePrimitiveType("int");
const doubleType = features.makePrimitiveType("double");
const stringType = features.makePrimitiveType("string");
const boolType = features.makePrimitiveType("bool");
const voidType = features.makePrimitiveType("void");

const functionType = features.makeFunctionType({
    display: (inputs, output) => `(${inputs.join(", ")}) -> ${output}`,
});

const arrayType = features.makeArrayType({
    display: (element) => `${element}[]`,
});

const builtinFunctions: features.BuiltinFunctionsOptions["functions"] = {
    "Console.WriteLine": () => ({
        groups: [],
        overloads: [functionType([], voidType), functionType([null], voidType)],
    }),
    Length: () => ({
        groups: [],
        overloads: [intType],
    }),
};

export const csharp = treesitterLanguage({
    name: "C#",
    editorExtensions: [csharpExtension()],
    treesitterUrl: treesitterCsharpExtension,
    features: [
        features.nameResolution({
            definitions: [
                map(node("variable_declaration"), (node) => [
                    {
                        definition: node.children[1].children[0],
                        value: node.children[1].children[1],
                    },
                ]),
                map(node("assignment_expression"), (node) => [
                    {
                        definition: node.children[0],
                        value: node.children[1],
                    },
                ]),
                map(node("parameter_list"), (node) =>
                    node.children.map((parameter) => ({ definition: parameter })),
                ),
                map(node("local_function_statement"), (node) => [{ definition: node.children[1] }]),
            ],
            scopes: [
                node("local_function_statement"),
                node("method_declaration"),
                node("for_statement"),
            ],
            names: [node("identifier")],
            ignore: Object.keys(builtinFunctions),
        }),
        features.builtinLiterals({
            literals: [
                [node("string_literal"), stringType],
                [node("integer_literal"), intType],
                [node("real_literal"), doubleType],
                [node("boolean_literal"), boolType],
                [node("null_literal"), null],
            ],
        }),
        features.builtinFunctions({
            call: [node("invocation_expression")],
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
                // C# represents `a * b` as defining a variable `b` of type `a*`
                map(node("declaration_expression"), (node) => {
                    if (node.children.length === 2 && node.children[0].type === "pointer_type") {
                        const left = node.children[0].children[0];
                        const right = node.children[1];

                        return [left, "*", right, node];
                    } else {
                        return undefined;
                    }
                }),
            ],
            operators: {
                "+": [intType, doubleType, stringType],
                "-": [intType, doubleType],
                "*": [intType, doubleType],
                "/": [intType, doubleType],
                "%": [intType, doubleType],
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
            comparisonTypes: [intType, doubleType, stringType, boolType],
            booleanType: boolType,
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
            booleanType: boolType,
        }),
        features.functions({
            function: [
                map(node("local_function_statement"), (node) => ({
                    function: node,
                    definition: node.children[1],
                    inputs: node.children[2].children,
                    output: node.children[0],
                })),
                map(node("method_declaration"), (node) => ({
                    function: node,
                    definition: node.children[1],
                    inputs: node.children[2].children,
                    output: node.children[0],
                })),
            ],
            returnValue: [map(node("return_statement"), (node) => node.children[0])],
            functionType,
            voidType: voidType,
        }),
        features.functionCalls({
            call: [
                map(node("invocation_expression"), (callNode) => ({
                    function: callNode.children[0],
                    inputs: callNode.children[1].children.map((node) => node.children[0]),
                    call: callNode,
                })),
            ],
            functionType,
        }),
        features.fields({
            field: [
                map(node("member_access_expression"), (node) => ({
                    object: node.children[0],
                    field: node.children[1],
                    access: node,
                })),
            ],
        }),
        features.arrays({
            array: [
                map(node("initializer_expression"), (node) => ({
                    array: node,
                    elements: node.children,
                })),
            ],
            arrayType,
        }),
        features.arrayIndexes({
            indexes: [
                map(node("element_access_expression"), (node) => ({
                    array: node.children[0],
                    index: node.children[1].children[0].children[0],
                    element: node,
                })),
            ],
            arrayType,
            indexType: intType,
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
                map(node("conditional_expression"), (node) => ({
                    condition: node.children[0],
                    then: node.children[1],
                    else: node.children[2],
                    output: node,
                })),
            ],
            booleanType: boolType,
        }),
        features.typeAnnotations({
            typeAnnotation: [
                map(node("parameter"), (parameter) => ({
                    value: parameter.children[1],
                    annotatedType: parameter.children[0],
                    annotation: parameter,
                })),
                map(node("variable_declaration"), (assignment) => ({
                    value: assignment.children[1].children[0],
                    annotatedType: assignment.children[0],
                    annotation: assignment,
                })),
                map(node("array_type"), (node) => ({
                    annotatedType: node,
                    type: (node) => arrayType(node.children[0]),
                })),
                map(node("foreach_statement"), (node) => ({
                    value: node.children[1],
                    annotatedType: node.children[0],
                })),
            ],
            type: [
                map(node("identifier"), (node) =>
                    node.key === "type" && !node.parent?.type.endsWith("type") ? node : undefined,
                ),
                node("predefined_type"),
            ],
        }),
        features.forEachLoops({
            forEachLoop: [
                map(node("foreach_statement"), (node) => ({
                    array: node.children[2],
                    element: node.children[1],
                    loop: node,
                })),
            ],
            arrayType: arrayType,
        }),
        features.updates({
            update: [
                map(node("postfix_unary_expression"), (node) =>
                    node.children.length === 1
                        ? {
                              value: node.children[0],
                              update: node,
                          }
                        : undefined,
                ),
            ],
            numberType: intType,
        }),
    ],
});
