import type { Language } from ".";
import { type Node } from "../compiler";
import { languageLoader, parse, type Parser } from "../parser";
import { ConcreteType, type Type } from "../solver";
import { makeNameResolver } from "../name-resolution";
import csharpLanguageUrl from "tree-sitter-c-sharp/tree-sitter-c_sharp.wasm?url";

const loadLanguage = languageLoader(csharpLanguageUrl);

class IntType extends ConcreteType {
    render(): string {
        return "int";
    }
}

class DoubleType extends ConcreteType {
    render(): string {
        return "double";
    }
}

class StringType extends ConcreteType {
    render(): string {
        return "string";
    }
}

class BoolType extends ConcreteType {
    render(): string {
        return "bool";
    }
}

class VoidType extends ConcreteType {
    render(): string {
        return "void";
    }
}

class FunctionType extends ConcreteType {
    kind = "function";

    constructor(inputs: Type[], output: Type) {
        super([output, ...inputs]);
    }

    render(children: ((root: boolean) => string)[], root: boolean): string {
        const [output, ...inputs] = children;
        const rendered = `(${inputs.map((input) => input(false)).join(", ")}) -> ${output(true)}`;
        return root ? rendered : `(${rendered})`;
    }
}

class ArrayType extends ConcreteType {
    constructor(element: Type) {
        super([element]);
    }

    render(children: ((root: boolean) => string)[]): string {
        const [element] = children;
        return `${element(false)}[]`;
    }
}

export const csharpLanguage: Language<Parser> = {
    name: "C#",
    editorExtensions: async () => [(await import("@replit/codemirror-lang-csharp")).csharp()],
    parse: async (code) => {
        const language = await loadLanguage();
        return parse(code, language);
    },
    compile: async (parser, compiler) => {
        compiler.ast = parser.ast;

        // Name resolution

        type Definition =
            | { type: "value"; node: Node }
            | { type: "builtinValue"; constraints: (node: Node) => void }
            | { type: "builtinType"; constraints: (node: Node) => void };

        type NameKind = "type" | "field";

        const nameResolver = makeNameResolver<Definition, NameKind>(parser.root);

        nameResolver.define("WriteLine", parser.root, {
            type: "builtinValue",
            constraints: (node) => {
                compiler.solver.overloadAt(node, [
                    [[node, new FunctionType([], new VoidType())]],
                    [[node, new FunctionType([compiler.temporaryAt(node)], new VoidType())]],
                ]);
            },
        });

        nameResolver.define("Length", parser.root, {
            type: "builtinValue",
            constraints: (node) => {
                compiler.solver.overloadAt(node, [[[node, new FunctionType([], new IntType())]]]);
            },
        });

        nameResolver.define("int", parser.root, {
            type: "builtinType",
            constraints: (node) => {
                compiler.solver.unifyAt(node, [node, new IntType()]);
            },
        });

        nameResolver.define("double", parser.root, {
            type: "builtinType",
            constraints: (node) => {
                compiler.solver.unifyAt(node, [node, new DoubleType()]);
            },
        });

        nameResolver.define("string", parser.root, {
            type: "builtinType",
            constraints: (node) => {
                compiler.solver.unifyAt(node, [node, new StringType()]);
            },
        });

        nameResolver.define("bool", parser.root, {
            type: "builtinType",
            constraints: (node) => {
                compiler.solver.unifyAt(node, [node, new BoolType()]);
            },
        });

        nameResolver.define("void", parser.root, {
            type: "builtinType",
            constraints: (node) => {
                compiler.solver.unifyAt(node, [node, new VoidType()]);
            },
        });

        parser.traverse(parser.root, {
            variable_declarator: (node) => {
                if (
                    node.parent?.type === "variable_declaration" &&
                    node.parent.children[0].type === "pointer_type"
                ) {
                    return;
                }

                const [name, value] = node.children;
                compiler.edge(value, name, "value");
                nameResolver.define(name.code, name, { type: "value", node: name });
                compiler.solver.unifyAt(node, [name, value]);
            },
            assignment_expression: (node) => {
                const { left, right } = node.fields;
                compiler.edge(right, left, "value");
                compiler.solver.unifyAt(node, [left, right]);
            },
            parameter_list: (node) => {
                for (const child of node.children) {
                    const { name } = child.fields;
                    nameResolver.define(name.code, name, { type: "value", node: name });
                }
            },
            local_function_statement: (node) => {
                const { name } = node.fields;
                nameResolver.define(name.code, name, { type: "value", node });
                nameResolver.scope(node);
            },
            method_declaration: (node) => {
                const { name } = node.fields;
                nameResolver.define(name.code, name, { type: "value", node });
                nameResolver.scope(node);
            },
            for_statement: (node) => {
                nameResolver.scope(node);
            },
            foreach_statement: (node) => {
                nameResolver.scope(node);
            },
            member_access_expression: (node) => {
                const { name } = node.fields;
                nameResolver.setKind(name, "field");
            },
        });

        const traverseIdentifier = (node: Node) => {
            const kind = nameResolver.getKind(node);

            const definitions = nameResolver.resolve(node.code, node, {
                implicitlyDefine: () => (kind == null ? { type: "value", node } : undefined),
            });

            for (const definition of definitions) {
                switch (definition.type) {
                    case "value": {
                        compiler.solver.unifyAt(node, [node, definition.node]);
                        compiler.replaceAt(node, node, definition.node);

                        break;
                    }
                    case "builtinValue": {
                        definition.constraints(node);
                        break;
                    }
                    case "builtinType": {
                        compiler.show(node, "types");
                        definition.constraints(node);
                        break;
                    }
                    default: {
                        definition satisfies never;
                    }
                }
            }
        };

        const traverseFunction = (node: Node, parameters: Node[], returnType: Node) => {
            for (const parameter of parameters) {
                compiler.edge(parameter, node, "input");
            }

            const traverseReturnValue = (value: Node) => {
                compiler.edge(value, node, "output");
                compiler.solver.unifyAt(node, [node, new FunctionType(parameters, value)]);
            };

            traverseReturnValue(returnType);

            parser.traverse(node, {
                return_statement: (returnStatement) => {
                    const [output] = returnStatement.children;
                    traverseReturnValue(output);
                },
            });
        };

        parser.traverse(parser.root, {
            // Identifiers
            identifier: traverseIdentifier,
            predefined_type: traverseIdentifier,
            member_access_expression: (node) => {
                const { expression, name } = node.fields;

                compiler.edge(expression, name, "expression");
                compiler.replaceAt(node, name, undefined);
                compiler.solver.unifyAt(node, [name, node]);
            },

            // Literals
            string_literal: (node) => {
                compiler.solver.unifyAt(node, [node, new StringType()]);
            },
            integer_literal: (node) => {
                compiler.solver.unifyAt(node, [node, new IntType()]);
            },
            real_literal: (node) => {
                compiler.solver.unifyAt(node, [node, new DoubleType()]);
            },
            boolean_literal: (node) => {
                compiler.solver.unifyAt(node, [node, new BoolType()]);
            },

            // Operators

            binary_expression: (node) => {
                const { left, right } = node.fields;
                const { operator } = node.strings;

                compiler.edge(left, node, "left");
                compiler.edge(right, node, "right");

                switch (operator) {
                    case "+": {
                        compiler.solver.unifyAt(node, [left, right]);
                        compiler.solver.overloadAt(node, [
                            [
                                [left, new IntType()],
                                [node, new IntType()],
                            ],
                            [
                                [left, new DoubleType()],
                                [node, new DoubleType()],
                            ],
                            [
                                [left, new StringType()],
                                [node, new StringType()],
                            ],
                        ]);

                        break;
                    }
                    case "-":
                    case "*":
                    case "/":
                    case "%":
                    case "**": {
                        compiler.solver.unifyAt(node, [left, right]);
                        compiler.solver.overloadAt(node, [
                            [
                                [left, new IntType()],
                                [node, new IntType()],
                            ],
                            [
                                [left, new DoubleType()],
                                [node, new DoubleType()],
                            ],
                        ]);

                        break;
                    }
                    case "<":
                    case "<=":
                    case ">":
                    case ">=":
                    case "==":
                    case "!=": {
                        compiler.solver.unifyAt(node, [left, right]);
                        compiler.solver.unifyAt(node, [node, new BoolType()]);

                        break;
                    }
                    case "&&":
                    case "||": {
                        compiler.solver.unifyAt(node, [left, right]);
                        compiler.solver.unifyAt(node, [left, new BoolType()]);
                        compiler.solver.unifyAt(node, [node, new BoolType()]);

                        break;
                    }
                }
            },

            declaration_expression: (node) => {
                // C# represents `a * b` as defining a variable `b` of type `a*`
                const { type, name } = node.fields;
                if (type.type === "pointer_type") {
                    const { type: left } = type.fields;
                    const right = name;

                    compiler.edge(left, node, "left");
                    compiler.edge(right, node, "right");

                    compiler.solver.unifyAt(node, [left, right]);
                    compiler.solver.overloadAt(node, [
                        [
                            [left, new IntType()],
                            [node, new IntType()],
                        ],
                        [
                            [left, new DoubleType()],
                            [node, new DoubleType()],
                        ],
                    ]);
                }
            },

            // Functions

            local_function_statement: (node) => {
                const { parameters, type } = node.fields;
                traverseFunction(node, parameters.children, type);
            },
            method_declaration: (node) => {
                const { parameters, returns } = node.fields;
                traverseFunction(node, parameters.children, returns);
            },

            // Function calls

            invocation_expression: (node) => {
                const { function: functionNode, arguments: argumentList } = node.fields;

                compiler.edge(functionNode, node, "function");

                const inputs = argumentList.children.map((argument) => argument.children[0]);

                for (const input of inputs) {
                    compiler.edge(input, node, "input");
                }

                compiler.solver.unifyAt(node, [functionNode, new FunctionType(inputs, node)]);
            },

            // Arrays

            initializer_expression: (node) => {
                compiler.solver.unifyAt(node, [node, new ArrayType(compiler.temporaryAt(node))]);

                for (const element of node.children) {
                    compiler.edge(element, node, "element");
                    compiler.solver.unifyAt(node, [node, new ArrayType(element)]);
                }
            },
            element_access_expression: (node) => {
                const { expression, subscript } = node.fields;
                const index = subscript.children[0].children[0];

                compiler.edge(expression, node, "array");
                compiler.solver.unifyAt(node, [expression, new ArrayType(node)]);

                compiler.edge(index, node, "index");
                compiler.solver.unifyAt(node, [index, new IntType()]);
            },

            // If statements

            if_statement: (node) => {
                const { condition } = node.fields;
                compiler.solver.unifyAt(node, [condition, new BoolType()]);
            },
            conditional_expression: (node) => {
                const { condition, consequence, alternative } = node.fields;

                compiler.edge(condition, consequence, "then");
                compiler.edge(consequence, node, "output");

                compiler.edge(condition, alternative, "else");
                compiler.edge(alternative, node, "output");

                compiler.solver.unifyAt(node, [condition, new BoolType()]);
                compiler.solver.unifyAt(node, [consequence, alternative]);
                compiler.solver.unifyAt(node, [node, consequence]);
            },

            // Type annotations

            parameter: (node) => {
                const { name, type } = node.fields;
                compiler.edge(type, name, "type");
                compiler.solver.unifyAt(node, [name, type]);
                compiler.replaceAt(node, node, name);
            },
            variable_declaration: (node) => {
                const [type, declarator] = node.children;
                if (type.type !== "pointer_type") {
                    const { name } = declarator.fields;

                    compiler.edge(type, name, "type");
                    compiler.solver.unifyAt(node, [name, type]);
                }
            },

            // For loops

            foreach_statement: (node) => {
                const { left, right } = node.fields;

                compiler.edge(right, left, "element");
                compiler.edge(right, node, "array");

                compiler.solver.unifyAt(node, [right, new ArrayType(left)]);
            },

            // Updates

            postfix_unary_expression: (node) => {
                if (node.children.length === 1) {
                    const [value] = node.children;

                    compiler.edge(value, node, "value");

                    compiler.solver.unifyAt(node, [value, new IntType()]);
                    compiler.solver.unifyAt(node, [node, value]);
                }
            },
        });
    },
};
