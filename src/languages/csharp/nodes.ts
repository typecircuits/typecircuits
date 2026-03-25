import type * as ts from "web-tree-sitter";
import { Node, type NodeDisplay, type Parse } from "@/compiler/lower/node";
import type { LowerContext } from "@/compiler/lower";
import * as types from "./types";
import { operators } from "./operators";
import { tryBuiltin } from "./builtins";

export class IdentifierNode extends Node {
    name: string;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        this.name = syntaxNode.text;
    }

    lower(ctx: LowerContext): Node | void {
        if (this.name === "_") {
            this.display = "hidden";
            return;
        }

        if (tryBuiltin(this.name, this, ctx)) {
            return;
        }

        return ctx.resolve(this.name, this);
    }
}

class BaseTypeNode extends Node {
    lower(ctx: LowerContext): Node | void {
        if (!ctx.options.showTypes) {
            this.display = "hidden";
        }
    }
}

export class TypeNode extends BaseTypeNode {
    name: string;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        this.name = syntaxNode.text;
    }

    lower(ctx: LowerContext): Node | void {
        super.lower(ctx);

        if (tryBuiltin(this.name, this, ctx)) {
            return;
        }

        const classDefinition = ctx.resolve(`class ${this.name}`, this);
        if (classDefinition != null) {
            ctx.typeConstraint(this, types.named(classDefinition, [], this.name));
        }
    }
}

export class ImplicitTypeNode extends BaseTypeNode {
    override display: NodeDisplay = "hidden";
}

export class UnderscorePatternNode extends Node {
    lower(ctx: LowerContext): Node | void {}

    override display: NodeDisplay = "hidden";
}

export class ThisNode extends Node {
    lower(ctx: LowerContext): Node | void {
        if (ctx.thisType != null) {
            ctx.typeConstraint(this, ctx.thisType);
            ctx.thisType = this; // so all instances of `this` are grouped
        }
    }

    display?: NodeDisplay = "hidden";
}

export class MemberAccessExpressionNode extends Node {
    object: Node;
    field: string;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.object] = parse(syntaxNode.childForFieldName("expression")!);
        this.field = syntaxNode.childForFieldName("name")!.text;
    }

    lower(ctx: LowerContext): Node | void {
        this.object.display = "hidden"; // place before lowering so only non-replaced nodes are hidden
        this.object = ctx.lower(this.object);

        ctx.edge({
            from: this.object,
            to: this,
            label: "object",
            description: "The object containing the field.",
            example: ["", "person", ".Name"],
        });

        if (tryBuiltin(this.field, this, ctx)) {
            return;
        }

        const fieldValue = ctx.resolve(this.field, this);
        if (fieldValue != null && fieldValue !== this) {
            return fieldValue;
        }
    }
}

export class InvocationExpressionNode extends Node {
    method: Node;
    inputs: Node[];

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.method] = parse(syntaxNode.childForFieldName("function"));
        this.inputs = parse(syntaxNode.childrenForFieldName("arguments"));
    }

    lower(ctx: LowerContext): Node | void {
        this.inputs = this.inputs.map((input) => ctx.lower(input));
        this.method = ctx.lower(this.method);

        ctx.edge({
            from: this.method,
            to: this,
            label: "method",
            description: "The method being called.",
            example: ["Console.", "WriteLine", '("Hello, world!")'],
        });

        for (const input of this.inputs) {
            ctx.edge({
                from: ctx.lower(input),
                to: this,
                label: "input",
                description: "The input to the method.",
                example: ["Console.WriteLine(", '"Hello, world!"', ")"],
            });
        }

        ctx.typeConstraint(this.method, types.function(this.inputs, this));
    }
}

abstract class AssignmentNode extends Node {
    abstract variable: Node;
    abstract value: Node | undefined;

    lower(ctx: LowerContext): Node | void {
        this.variable = ctx.lower(this.variable);

        if (this.value == null) {
            return;
        }

        this.value = ctx.lower(this.value);

        ctx.edge({
            from: this.value,
            to: this.variable,
            label: "value",
            description: "The value of a variable.",
            example: ["a = ", "b", ""],
        });

        ctx.typeConstraint(this.variable, this.value);
    }
}

export class VariableDeclarationNode extends AssignmentNode {
    type: Node;
    variable: Node;
    value: Node | undefined;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.type] = parse(syntaxNode.childForFieldName("type")!);
        [this.variable] = parse(syntaxNode.child(1)!.childForFieldName("name")!);
        [this.value] = parse(syntaxNode.child(1)!.child(2));
    }

    lower(ctx: LowerContext): Node | void {
        super.lower(ctx);

        this.type = ctx.lower(this.type);

        if (this.value != null) {
            this.value = ctx.lower(this.value);
        }

        ctx.edge({
            from: this.type,
            to: this.variable,
            label: "type",
            description: "The type of the variable.",
            example: ["", "int", " a = b;"],
        });

        ctx.typeConstraint(this.variable, this.type);

        if (this.value != null) {
            ctx.edge({
                from: this.value,
                to: this.variable,
                label: "value",
                description: "The value of a variable.",
                example: ["a = ", "b", ""],
            });

            ctx.typeConstraint(this.variable, this.value);
        }

        return this.variable;
    }

    override display: NodeDisplay = "hidden";
}

export class FieldDeclarationNode extends VariableDeclarationNode {}

export class AssignmentExpressionNode extends AssignmentNode {
    variable: Node;
    value: Node;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.variable] = parse(syntaxNode.childForFieldName("left")!);
        [this.value] = parse(syntaxNode.childForFieldName("right")!);
    }

    lower(ctx: LowerContext): Node | void {
        super.lower(ctx);

        ctx.typeConstraint(this, this.value);

        ctx.edge({
            from: this.value,
            to: this,
            label: "value",
            description: "This assignment also produces the value of the variable.",
            example: ["a = ", "b", ""],
        });
    }

    override display?: NodeDisplay = "hidden";
}

export class IntegerLiteralNode extends Node {
    lower(ctx: LowerContext): Node | void {
        ctx.typeConstraint(this, types.int);
    }
}

export class StringLiteralNode extends Node {
    lower(ctx: LowerContext): Node | void {
        ctx.typeConstraint(this, types.string);
    }
}

export class BooleanLiteralNode extends Node {
    lower(ctx: LowerContext): Node | void {
        ctx.typeConstraint(this, types.bool);
    }
}

export class NullLiteralNode extends Node {
    lower(ctx: LowerContext): Node | void {}
}

export class PredefinedTypeNode extends BaseTypeNode {
    name: string;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        this.name = syntaxNode.text;
    }

    lower(ctx: LowerContext): Node | void {
        super.lower(ctx);

        switch (this.name) {
            case "int":
                ctx.typeConstraint(this, types.int);
                break;
            case "double":
                ctx.typeConstraint(this, types.double);
                break;
            case "bool":
                ctx.typeConstraint(this, types.bool);
                break;
            case "string":
                ctx.typeConstraint(this, types.string);
                break;
            case "void":
                ctx.typeConstraint(this, types.void);
                break;
        }
    }
}

export class ArrayTypeNode extends BaseTypeNode {
    element: Node;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.element] = parse(syntaxNode.childForFieldName("type")!);
    }

    lower(ctx: LowerContext): Node | void {
        super.lower(ctx);
        this.element = ctx.lower(this.element);

        ctx.typeConstraint(this, types.array(this.element));

        ctx.edge({
            from: this.element,
            to: this,
            label: "element",
            description: "The element type of the array.",
            example: ["", "int", "[] array;"],
        });
    }
}

export class ParameterNode extends Node {
    type: Node;
    name: Node;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.type] = parse(syntaxNode.childForFieldName("type")!);
        [this.name] = parse(syntaxNode.childForFieldName("name")!);
    }

    lower(ctx: LowerContext): Node | void {
        this.type = ctx.lower(this.type);
        this.name = ctx.lower(this.name);

        ctx.edge({
            from: this.type,
            to: this.name,
            label: "type",
            description: "The type of the parameter.",
            example: ["", "int", " x"],
        });

        ctx.typeConstraint(this.name, this.type);
        ctx.typeConstraint(this, this.type);

        return this.name;
    }

    override display?: NodeDisplay = "hidden";
}

export class ClassDeclarationNode extends Node {
    name: string;
    fields: Node[] = [];
    constructors: Node[] = [];
    methods: Node[] = [];

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);

        this.name = syntaxNode.childForFieldName("name")!.text;

        for (const child of parse(syntaxNode.childForFieldName("body")!.namedChildren)) {
            if (child instanceof FieldDeclarationNode) {
                this.fields.push(child);
            } else if (child instanceof ConstructorDeclarationNode) {
                this.constructors.push(child);
            } else if (child instanceof MethodDeclarationNode) {
                child.isInClass = true;
                this.methods.push(child);
            }
        }
    }

    lower(ctx: LowerContext): Node | void {
        // Note: Do not create a scope

        const thisType = types.named(this, [], this.name);

        ctx.withThisType(thisType, () => {
            this.fields = this.fields.map((field) => ctx.lower(field));
            this.constructors = this.constructors.map((constructor) => ctx.lower(constructor));
            this.methods = this.methods.map((method) => ctx.lower(method));
        });

        ctx.define(`class ${this.name}`, this);

        for (const field of this.fields) {
            ctx.edge({
                from: field,
                to: this,
                label: "field",
                description: "A field of the class.",
                example: ["class MyClass { ", "int x;", " }"],
            });
        }

        for (const constructor of this.constructors) {
            ctx.define(`new ${this.name}`, constructor);

            ctx.edge({
                from: constructor,
                to: this,
                label: "constructor",
                description: "A constructor of the class.",
                example: ["class MyClass { ", "MyClass(int x);", " }"],
            });

            if (constructor instanceof ConstructorDeclarationNode) {
                ctx.typeConstraint(constructor, types.function(constructor.parameters, thisType));
            }
        }

        for (const method of this.methods) {
            ctx.edge({
                from: method,
                to: this,
                label: "method",
                description: "A method of the class.",
                example: ["class MyClass { ", "int increment(int x);", " }"],
            });
        }
    }

    override display: NodeDisplay = "hidden";
}

export class MethodDeclarationNode extends Node {
    type: Node;
    name: string;
    parameters: Node[];
    body: Node | undefined;
    isInClass = false;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);

        [this.type] = parse(syntaxNode.childForFieldName("returns")!);
        this.name = syntaxNode.childForFieldName("name")!.text;
        this.parameters = parse(syntaxNode.childrenForFieldName("parameters"));

        [this.body] = parse(syntaxNode.childForFieldName("body"));
    }

    lower(ctx: LowerContext): Node | void {
        ctx.define(this.name, this);

        ctx.pushScope();

        this.type = ctx.lower(this.type);

        this.parameters = this.parameters.map((parameter) => {
            if (parameter instanceof ParameterNode) {
                ctx.define(parameter.name.span.source, parameter.name);
            }

            return ctx.lower(parameter);
        });

        this.body = this.body?.lower(ctx) ?? this.body;

        const { returnValues } = ctx.popScope();

        if (this.body != null && returnValues.length === 0) {
            returnValues.push({ type: types.void });
        }

        for (const parameter of this.parameters) {
            ctx.edge({
                from: parameter,
                to: this,
                label: "parameter",
                description: "A parameter within the method.",
                example: ["int increment(", "int x", ") { return x + 1; }"],
            });
        }

        for (const returnValue of returnValues) {
            if (returnValue.value != null) {
                ctx.edge({
                    from: returnValue.value,
                    to: this,
                    label: "return value",
                    description: "The return value of the method.",
                    example: ["int increment(int x) { return ", "x + 1", "; }"],
                });
            }

            ctx.typeConstraint(this.type, returnValue.type);
        }

        ctx.typeConstraint(this, types.function(this.parameters, this.type));

        for (const parameter of this.parameters) {
            ctx.edge({
                from: parameter,
                to: this,
                label: "parameter",
                description: "A parameter of the method.",
                example: ["int increment(", "int x", ") { return x + 1; }"],
            });
        }

        ctx.edge({
            from: this.type,
            to: this,
            label: "return type",
            description: "The return type of the method.",
            example: ["", "int", " increment(int x) { return x + 1; }"],
        });

        if (!this.isInClass) {
            ctx.define(this.name, this);
        }
    }
}

export class LocalFunctionStatementNode extends MethodDeclarationNode {
    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);

        [this.type] = parse(syntaxNode.childForFieldName("type")!);
        this.name = syntaxNode.childForFieldName("name")!.text;
        this.parameters = parse(syntaxNode.childrenForFieldName("parameters"));

        [this.body] = parse(syntaxNode.childForFieldName("body"));
    }
}

export class ConstructorDeclarationNode extends Node {
    parameters: Node[];
    body: Node | undefined;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);

        this.parameters = parse(syntaxNode.childForFieldName("parameters"));
        [this.body] = parse(syntaxNode.childForFieldName("body"));
    }

    lower(ctx: LowerContext): Node | void {
        ctx.pushScope();

        this.parameters = this.parameters.map((parameter) => {
            if (parameter instanceof ParameterNode) {
                ctx.define(parameter.name.span.source, parameter.name);
            }

            return ctx.lower(parameter);
        });

        this.body = this.body?.lower(ctx) ?? this.body;

        ctx.popScope();

        for (const parameter of this.parameters) {
            ctx.edge({
                from: parameter,
                to: this,
                label: "parameter",
                description: "A parameter of the constructor.",
                example: ["MyClass(", "int x", ") { this.x = x; }"],
            });
        }
    }

    override display?: NodeDisplay = "untyped";
}

export class InitializerExpressionNode extends Node {
    elements: Node[];

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        this.elements = parse(syntaxNode.children);
    }

    lower(ctx: LowerContext): Node | void {
        this.elements = this.elements.map((element) => ctx.lower(element));

        for (const element of this.elements) {
            ctx.edge({
                from: element,
                to: this,
                label: "element",
                description: "An element of an array.",
                example: ["{ ", "1", ", 2, 3 }"],
            });
        }

        const elementType = this.elements[0] ?? null;
        for (const child of this.elements.slice(1)) {
            ctx.typeConstraint(child, elementType);
        }

        ctx.typeConstraint(this, types.array(elementType));
    }
}

export class ElementAccessExpressionNode extends Node {
    array: Node;
    index: Node;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.array] = parse(syntaxNode.childForFieldName("expression")!);
        [this.index] = parse(syntaxNode.childForFieldName("subscript")!);
    }

    lower(ctx: LowerContext): Node | void {
        this.array = ctx.lower(this.array);
        this.index = ctx.lower(this.index);

        ctx.edge({
            from: this.array,
            to: this,
            label: "array",
            description: "The array being indexed.",
            example: ["", "numbers", "[0]"],
        });

        ctx.edge({
            from: this.index,
            to: this,
            label: "index",
            description: "The index of the element being accessed. Must be an int.",
            example: ["numbers[", "0", "]"],
        });

        ctx.typeConstraint(this.index, types.int);
        ctx.typeConstraint(this.array, types.array(this));
    }
}

export class BinaryExpressionNode extends Node {
    left: Node;
    right: Node;
    operator: string;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);

        [this.left] = parse(syntaxNode.childForFieldName("left"));
        this.operator = syntaxNode.childForFieldName("operator")!.text;
        [this.right] = parse(syntaxNode.childForFieldName("right"));
    }

    lower(ctx: LowerContext): Node | void {
        this.left = ctx.lower(this.left);
        this.right = ctx.lower(this.right);

        if (!(this.operator in operators)) {
            this.display = "hidden";
            return;
        }

        ctx.edge({
            from: this.left,
            to: this,
            label: "left",
            description: "The first input to the operator.",
            example: ["", "a", ` ${this.operator} b`],
        });

        ctx.edge({
            from: this.right,
            to: this,
            label: "right",
            description: "The second input to the operator.",
            example: [`a ${this.operator} `, "b", ""],
        });

        const operatorConstraints = operators[this.operator];
        const { types = [], overloads = [] } = operatorConstraints(this.left, this.right, this);

        for (const { node, type } of types) {
            ctx.typeConstraint(node, type);
        }

        if (overloads.length > 0) {
            ctx.overloadConstraint(overloads);
        }
    }
}

export class BlockNode extends Node {
    statements: Node[];

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        this.statements = parse(syntaxNode.children);
    }

    lower(ctx: LowerContext): Node | void {
        ctx.pushScope();

        this.statements = this.statements.map((statement) => ctx.lower(statement));

        // `return` propagates through blocks
        const { returnValues } = ctx.popScope();
        ctx.scope().returnValues.push(...returnValues);
    }

    override display?: NodeDisplay = "hidden";
}

export class IfStatementNode extends Node {
    condition: Node;
    thenNode: Node;
    elseNode: Node | undefined;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.condition] = parse(syntaxNode.childForFieldName("condition"));
        [this.thenNode] = parse(syntaxNode.childForFieldName("consequence"));
        [this.elseNode] = parse(syntaxNode.childForFieldName("alternative"));
    }

    lower(ctx: LowerContext): Node | void {
        this.condition = ctx.lower(this.condition);
        this.thenNode = ctx.lower(this.thenNode);

        if (this.elseNode != null) {
            this.elseNode = ctx.lower(this.elseNode);
        }

        ctx.edge({
            from: this.condition,
            to: this,
            label: "condition",
            description: "The condition in an if statement. Must be a boolean.",
            example: ["if (", "x == 0", ")"],
        });

        ctx.typeConstraint(this.condition, types.bool);
        ctx.typeConstraint(this, this.thenNode);

        if (this.elseNode != null) {
            ctx.typeConstraint(this, this.elseNode);
        }
    }

    override display?: NodeDisplay = "untyped";
}

export class ConditionalExpressionNode extends Node {
    condition: Node;
    thenNode: Node;
    elseNode: Node;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.condition] = parse(syntaxNode.childForFieldName("condition"));
        [this.thenNode] = parse(syntaxNode.childForFieldName("consequence"));
        [this.elseNode] = parse(syntaxNode.childForFieldName("alternative"));
    }

    lower(ctx: LowerContext): Node | void {
        this.condition = ctx.lower(this.condition);
        this.thenNode = ctx.lower(this.thenNode);
        this.elseNode = ctx.lower(this.elseNode);

        ctx.edge({
            from: this.condition,
            to: this,
            label: "condition",
            description: "The condition in a ternary expression. Must be a boolean.",
            example: ["", "x == 0", " ? a : b"],
        });

        ctx.edge({
            from: this.thenNode,
            to: this,
            label: "then",
            description: "Runs if the condition is true.",
            example: ["x == 0 ? ", "a", " : b"],
        });

        ctx.edge({
            from: this.elseNode,
            to: this,
            label: "else",
            description: "Runs if the condition is false.",
            example: ["x == 0 ? a : ", "b", ""],
        });

        ctx.typeConstraint(this.condition, types.bool);
        ctx.typeConstraint(this, this.thenNode);
        ctx.typeConstraint(this, this.elseNode);
    }
}

export class ReturnStatementNode extends Node {
    value: Node | undefined;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.value] = parse(syntaxNode.children);
    }

    lower(ctx: LowerContext): Node | void {
        if (this.value != null) {
            this.value = ctx.lower(this.value);

            ctx.scope().returnValues.push({
                statement: this,
                value: this.value,
                type: this.value,
            });

            ctx.edge({
                from: this.value,
                to: this,
                label: "value",
                description: "The value being returned.",
                example: ["return ", "x", ";"],
            });
        }
    }

    override display?: NodeDisplay = "untyped";
}

export class PostfixUnaryExpressionNode extends Node {
    value: Node;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.value] = parse(syntaxNode.children[0]);
    }

    lower(ctx: LowerContext): Node | void {
        this.value = ctx.lower(this.value);

        ctx.edge({
            from: this.value,
            to: this,
            label: "value",
            description: "The value being updated. Must be a number.",
            example: ["", "i", "++"],
        });

        ctx.typeConstraint(this.value, types.int);
        ctx.typeConstraint(this, this.value);
    }
}

export class ObjectCreationExpressionNode extends Node {
    type: Node;
    inputs: Node[];

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.type] = parse(syntaxNode.childForFieldName("type")!);
        this.inputs = parse(syntaxNode.childForFieldName("arguments")!);
    }

    lower(ctx: LowerContext): Node | void {
        this.type = ctx.lower(this.type);
        this.type.display = "hidden";

        this.inputs = this.inputs.map((input) => ctx.lower(input));

        let constructorDefinition: Node = this;
        if (this.type instanceof IdentifierNode) {
            constructorDefinition = ctx.resolve(`new ${this.type.name}`, this);

            if (constructorDefinition !== this) {
                this.display = "hidden";

                ctx.typeConstraint(constructorDefinition, types.function(this.inputs, this));
            }
        }

        for (const input of this.inputs) {
            ctx.edge({
                from: input,
                to: constructorDefinition,
                label: "input",
                description: "The input to the constructor.",
                example: ["new MyClass(", "1", ")"],
            });
        }

        ctx.typeConstraint(this, this.type);
    }
}

// C# represents `a * b` as defining a variable `b` of type `a*`. Convert this
// to multiplication.

export class PointerTypeNode extends BaseTypeNode {
    element: Node;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.element] = parse(syntaxNode.childForFieldName("type")!);
    }

    lower(ctx: LowerContext): Node | void {
        super.lower(ctx);
        this.element = ctx.lower(this.element);

        // Don't assign any constraints, this will be converted to multiplication
    }
}

export class DeclarationExpressionNode extends Node {
    type: Node;
    name: Node;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.type] = parse(syntaxNode.childForFieldName("type")!);
        [this.name] = parse(syntaxNode.childForFieldName("name")!);
    }

    lower(ctx: LowerContext): Node | void {
        if (this.type instanceof PointerTypeNode && this.type.element instanceof IdentifierNode) {
            const node = Object.create(BinaryExpressionNode.prototype) as BinaryExpressionNode;
            node.span = this.span;
            node.left = this.type.element;
            node.right = this.name;
            node.operator = "*";
            node.lower(ctx);
            return node;
        }
    }
}
