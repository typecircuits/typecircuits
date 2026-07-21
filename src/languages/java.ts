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
                map(node("parameters"), (node) =>
                    node.children().map((parameter) => ({ definition: parameter })),
                ),
                map(node("function_definition"), (node) => [{ definition: node.children()[0] }]),
            ],
            scopes: [node("function_definition"), node("for_statement")],
            names: [node("identifier")],
            ignore: Object.keys(builtinFunctions),
            implicit: () => true,
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
                        const name = node.child("name")!;
                        const object = node.child("object");
                        const methodName =
                            object == null ? name.text : `${object.text}.${name.text}`;

                        return [name, methodName];
                    }
                    case "field_access": {
                        return [node.child("field")!, node.child("field")!.text];
                    }
                    default: {
                        return undefined;
                    }
                }
            },
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
                    node.child("left")!,
                    node.string("operator")!,
                    node.child("right")!,
                    node,
                ]),
            ],
            operators: ["<", "<=", ">", ">="],
            comparisonTypes: [intType, doubleType, stringType, booleanType],
            booleanType,
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
            operators: ["==", "!="],
            booleanType,
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
            booleanType,
        }),
        features.functions({
            function: [
                map(node("method_declaration"), (node) => ({
                    function: node,
                    definition: node.child("name")!,
                    inputs: node.child("parameters")!.children(),
                    output: node.child("type")!,
                })),
            ],
            returnValue: [map(node("return_statement"), (node) => node.children()[0])],
            functionType,
            voidType: voidType,
        }),
        features.functionCalls({
            call: [
                map(node("method_invocation"), (callNode) => ({
                    object: callNode.child("object"),
                    function: callNode.child("name")!,
                    inputs: callNode.child("arguments")!.children(),
                    call: callNode,
                })),
            ],
            functionType,
        }),
        features.fields({
            field: [
                map(node("field_access"), (node) => ({
                    object: node.child("object")!,
                    field: node.child("field")!,
                    access: node,
                })),
            ],
        }),
        features.arrays({
            array: [
                map(node("array_initializer"), (node) => ({
                    array: node,
                    elements: node.children(),
                })),
            ],
            arrayType,
        }),
        features.arrayIndexes({
            indexes: [
                map(node("array_access"), (node) => ({
                    array: node.child("array")!,
                    index: node.child("index")!,
                    element: node,
                })),
            ],
            arrayType,
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
                map(node("ternary_expression"), (node) => ({
                    condition: node.child("condition")!,
                    then: node.child("consequence")!,
                    else: node.child("alternative")!,
                    output: node,
                })),
            ],
            booleanType: booleanType,
        }),
        features.typeAnnotations({
            typeAnnotation: [
                map(node("formal_parameter"), (parameter) => ({
                    value: parameter.child("name")!,
                    annotatedType: parameter.child("type")!,
                    annotation: parameter,
                })),
                map(node("local_variable_declaration"), (assignment) => ({
                    value: assignment.child("declarator")!.child("name")!,
                    annotatedType: assignment.child("type")!,
                    annotation: assignment,
                })),
                map(node("array_type"), (node) => ({
                    annotatedType: node,
                    type: (node) => arrayType(node.child("element")!),
                })),
                map(node("enhanced_for_statement"), (node) => ({
                    value: node.child("name")!,
                    annotatedType: node.child("type")!,
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
                    array: node.child("value")!,
                    element: node.child("name")!,
                    loop: node,
                })),
            ],
            arrayType: arrayType,
        }),
        features.updates({
            update: [
                map(node("update_expression"), (node) => ({
                    value: node.children()[0],
                    update: node,
                })),
            ],
            numberType: intType,
        }),
    ],
});
