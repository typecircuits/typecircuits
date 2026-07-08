import treesitterJavaUrl from "tree-sitter-java/tree-sitter-java.wasm?url";
import { java as javaExtension } from "@codemirror/lang-java";
import { map, node, treesitterLanguage } from "@/compiler";
import * as features from "@/compiler/features";

const intType = features.makePrimitiveType("int");
const doubleType = features.makePrimitiveType("double");
const stringType = features.makePrimitiveType("String");
const booleanType = features.makePrimitiveType("boolean");
const voidType = features.makePrimitiveType("void");

const functionType = features.makeFunctionType({
    display: (inputs, output) => `(${inputs.join(", ")}) -> ${output}`,
});

const arrayType = features.makeArrayType({
    display: (element) => `${element}[]`,
});

const builtinFunctions: features.BuiltinFunctionsOptions["functions"] = {
    "System.out.println": () => ({
        groups: [],
        overloads: [functionType([], voidType), functionType([null], voidType)],
    }),
    "Math.random": () => ({
        groups: [],
        overloads: [functionType([], doubleType)],
    }),
    length: () => ({
        groups: [],
        overloads: [intType],
    }),
    // Use the unboxed types to simulate implicit boxing
    String: () => ({
        groups: [],
        overloads: [functionType([null], stringType)],
    }),
    Integer: () => ({
        groups: [],
        overloads: [functionType([null], intType)],
    }),
    Double: () => ({
        groups: [],
        overloads: [functionType([null], doubleType)],
    }),
    Boolean: () => ({
        groups: [],
        overloads: [functionType([null], booleanType)],
    }),
};

export const java = treesitterLanguage({
    name: "Java",
    editorExtensions: [javaExtension()],
    treesitterUrl: treesitterJavaUrl,
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
                map(node("parameters"), (node) =>
                    node.children.map((parameter) => ({ definition: parameter })),
                ),
                map(node("function_definition"), (node) => [{ definition: node.children[0] }]),
            ],
            scopes: [node("function_definition"), node("for_statement")],
            names: [node("identifier")],
            ignore: Object.keys(builtinFunctions),
        }),
        features.builtinLiterals({
            literals: [
                [node("string_literal"), stringType],
                [node("decimal_integer_literal"), intType],
                [node("decimal_floating_point_literal"), doubleType],
                [node("true"), booleanType],
                [node("false"), booleanType],
                [node("null_literal"), null],
            ],
        }),
        features.builtinFunctions({
            call: [node("method_invocation"), node("field_access")],
            function: (node) => {
                switch (node.type) {
                    case "method_invocation": {
                        const methodName = node.children
                            .slice(0, -1)
                            .map((node) => node.text)
                            .join(".");

                        return [node.children.at(-2)!, methodName];
                    }
                    case "field_access": {
                        return [node.children[1], node.children[1].text];
                    }
                    default: {
                        return undefined;
                    }
                }
            },
            inputs: (node) => node.children.at(-1)!.children,
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
            ],
            operators: ["&&", "||"],
            booleanType,
        }),
        features.functions({
            function: [
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
                map(node("method_invocation"), (callNode) => ({
                    object: callNode.children.at(-3),
                    function: callNode.children.at(-2)!,
                    inputs: callNode.children.at(-1)!.children,
                    call: callNode,
                })),
            ],
            functionType,
        }),
        features.fields({
            field: [
                map(node("field_access"), (node) => ({
                    object: node.children[0],
                    field: node.children[1],
                    access: node,
                })),
            ],
        }),
        features.arrays({
            array: [
                map(node("array_initializer"), (node) => ({
                    array: node,
                    elements: node.children,
                })),
            ],
            arrayType,
        }),
        features.arrayIndexes({
            indexes: [
                map(node("array_access"), (node) => ({
                    array: node.children[0],
                    index: node.children[1],
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
                map(node("ternary_expression"), (node) => ({
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
                map(node("formal_parameter"), (parameter) => ({
                    value: parameter.children[1],
                    annotatedType: parameter.children[0],
                    annotation: parameter,
                })),
                map(node("local_variable_declaration"), (assignment) => ({
                    value: assignment.children[1].children[0],
                    annotatedType: assignment.children[0],
                    annotation: assignment,
                })),
                map(node("array_type"), (node) => ({
                    annotatedType: node,
                    type: (node) => arrayType(node.children[0]),
                })),
                map(node("enhanced_for_statement"), (node) => ({
                    value: node.children[1],
                    annotatedType: node.children[0],
                })),
            ],
            type: [
                node("type_identifier"),
                node("integral_type"),
                node("floating_point_type"),
                node("boolean_type"),
                node("void_type"),
            ],
        }),
        features.forEachLoops({
            forEachLoop: [
                map(node("enhanced_for_statement"), (node) => ({
                    array: node.children[2],
                    element: node.children[1],
                    loop: node,
                })),
            ],
            arrayType: arrayType,
        }),
        features.updates({
            update: [
                map(node("update_expression"), (node) => ({
                    value: node.children[0],
                    update: node,
                })),
            ],
            numberType: intType,
        }),
    ],
});
