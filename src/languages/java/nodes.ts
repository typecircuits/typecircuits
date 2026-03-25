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

export class TypeIdentifierNode extends BaseTypeNode {
    name: string;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        this.name = syntaxNode.text;
    }

    lower(ctx: LowerContext): Node | void {
        super.lower(ctx);

        if (this.name === "var") {
            this.display = "hidden";
            return;
        }

        if (tryBuiltin(this.name, this, ctx)) {
            return;
        }

        const classDefinition = ctx.resolve(`class ${this.name}`, this);
        if (classDefinition != null) {
            ctx.typeConstraint(this, types.named(classDefinition, [], this.name));
        }
    }
}

export class UnderscorePatternNode extends Node {
    lower(ctx: LowerContext): Node | void {
        this.display = "hidden";
    }
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

export class FieldAccessNode extends Node {
    object: Node;
    field: string;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.object] = parse(syntaxNode.childForFieldName("object")!);
        this.field = syntaxNode.childForFieldName("field")!.text;
    }

    lower(ctx: LowerContext): Node | void {
        this.object.display = "hidden"; // place before lowering so only non-replaced nodes are hidden
        this.object = ctx.lower(this.object);

        ctx.edge({
            from: this.object,
            to: this,
            label: "object",
            description: "The object containing the field.",
            example: ["", "System", ".out"],
        });

        if (tryBuiltin(this.span.source, this, ctx)) {
            return;
        }

        const fieldValue = ctx.resolve(this.field, this);
        if (fieldValue != null && fieldValue !== this) {
            ctx.edge({
                from: fieldValue,
                to: this,
                label: "field",
                description: "The field being accessed.",
                example: ["System.", "out", ""],
            });

            ctx.typeConstraint(this, fieldValue);
        }
    }
}

export class MethodInvocationNode extends Node {
    object: Node | undefined;
    method: Node;
    inputs: Node[];

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.object] = parse(syntaxNode.childForFieldName("object"));
        [this.method] = parse(syntaxNode.childForFieldName("name")!);
        this.inputs = parse(syntaxNode.childrenForFieldName("arguments"));
    }

    lower(ctx: LowerContext): Node | void {
        this.object = this.object?.lower(ctx) ?? this.object;
        this.inputs = this.inputs.map((input) => ctx.lower(input));
        this.method = ctx.lower(this.method);

        if (this.object != null) {
            ctx.edge({
                from: this.object,
                to: this,
                label: "object",
                description: "The object containing the field.",
                example: ["", "System.out", '.println("Hello, world!")'],
            });

            tryBuiltin(`${this.object.span.source}.${this.method.span.source}`, this.method, ctx);
        }

        ctx.edge({
            from: this.method,
            to: this,
            label: "method",
            description: "The method being called.",
            example: ["System.out.", "println", '("Hello, world!")'],
        });

        for (const input of this.inputs) {
            ctx.edge({
                from: ctx.lower(input),
                to: this,
                label: "input",
                description: "The input to the method.",
                example: ["System.out.println(", '"Hello, world!"', ")"],
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

export class LocalVariableDeclarationNode extends AssignmentNode {
    type: Node;
    variable: Node;
    value: Node | undefined;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.type] = parse(syntaxNode.childForFieldName("type")!);
        [this.variable] = parse(
            syntaxNode.childForFieldName("declarator")!.childForFieldName("name")!,
        );
        [this.value] = parse(
            syntaxNode.childForFieldName("declarator")!.childForFieldName("value"),
        );
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

export class FieldDeclarationNode extends LocalVariableDeclarationNode {}

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

export class DecimalIntegerLiteralNode extends Node {
    lower(ctx: LowerContext): Node | void {
        ctx.typeConstraint(this, types.int);
    }
}

export class StringLiteralNode extends Node {
    lower(ctx: LowerContext): Node | void {
        ctx.typeConstraint(this, types.string);
    }
}

abstract class BooleanNode extends Node {
    lower(ctx: LowerContext): Node | void {
        ctx.typeConstraint(this, types.boolean);
    }
}

export class TrueNode extends BooleanNode {}

export class FalseNode extends BooleanNode {}

export class NullNode extends Node {
    lower(ctx: LowerContext): Node | void {}
}

export class IntegralTypeNode extends BaseTypeNode {
    lower(ctx: LowerContext): Node | void {
        super.lower(ctx);
        ctx.typeConstraint(this, types.int);
    }
}

export class FloatingPointTypeNode extends BaseTypeNode {
    lower(ctx: LowerContext): Node | void {
        super.lower(ctx);
        ctx.typeConstraint(this, types.double);
    }
}

export class BooleanTypeNode extends BaseTypeNode {
    lower(ctx: LowerContext): Node | void {
        super.lower(ctx);
        ctx.typeConstraint(this, types.boolean);
    }
}

export class VoidTypeNode extends BaseTypeNode {
    lower(ctx: LowerContext): Node | void {
        super.lower(ctx);
        ctx.typeConstraint(this, types.void);
    }
}

export class ArrayTypeNode extends BaseTypeNode {
    element: Node;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.element] = parse(syntaxNode.childForFieldName("element")!);
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

export class FormalParameterNode extends Node {
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

    override display: NodeDisplay = "untyped";
}

export class MethodDeclarationNode extends Node {
    type: Node;
    name: string;
    parameters: Node[];
    body: Node | undefined;
    isInClass = false;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);

        [this.type] = parse(syntaxNode.childForFieldName("type")!);
        this.name = syntaxNode.childForFieldName("name")!.text;
        this.parameters = parse(syntaxNode.childrenForFieldName("parameters"));

        [this.body] = parse(syntaxNode.childForFieldName("body"));
    }

    lower(ctx: LowerContext): Node | void {
        ctx.define(this.name, this);

        ctx.pushScope();

        this.type = ctx.lower(this.type);

        this.parameters = this.parameters.map((parameter) => {
            if (parameter instanceof IdentifierNode) {
                ctx.define(parameter.span.source, parameter);
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

export class ConstructorDeclarationNode extends Node {
    parameters: Node[];
    body: Node | undefined;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);

        this.parameters = parse(syntaxNode.childrenForFieldName("parameters"));

        [this.body] = parse(syntaxNode.childForFieldName("body"));
    }

    lower(ctx: LowerContext): Node | void {
        ctx.pushScope();

        this.parameters = this.parameters.map((parameter) => {
            if (parameter instanceof IdentifierNode) {
                ctx.define(parameter.span.source, parameter);
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

    override display?: NodeDisplay = "hidden";
}

export class ArrayInitializerNode extends Node {
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

export class ArrayAccessNode extends Node {
    array: Node;
    index: Node;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.array] = parse(syntaxNode.childForFieldName("array")!);
        [this.index] = parse(syntaxNode.childForFieldName("index")!);
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
        this.statements = this.statements.map((statement) => ctx.lower(statement));
    }

    override display?: NodeDisplay = "hidden";
}

export class ConstructorBodyNode extends BlockNode {}

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

        ctx.typeConstraint(this.condition, types.boolean);
        ctx.typeConstraint(this, this.thenNode);

        if (this.elseNode != null) {
            ctx.typeConstraint(this, this.elseNode);
        }
    }

    override display?: NodeDisplay = "untyped";
}

export class TernaryExpressionNode extends Node {
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

        ctx.typeConstraint(this.condition, types.boolean);
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

export class UpdateExpressionNode extends Node {
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
        this.inputs = parse(syntaxNode.childrenForFieldName("arguments"));
    }

    lower(ctx: LowerContext): Node | void {
        this.type = ctx.lower(this.type);
        this.type.display = "hidden";

        this.inputs = this.inputs.map((input) => ctx.lower(input));

        let constructorDefinition: Node = this;
        if (this.type instanceof TypeIdentifierNode) {
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

export class ArrayCreationExpressionNode extends Node {
    type: Node;
    length: Node | undefined;

    constructor(syntaxNode: ts.Node, parse: Parse) {
        super(syntaxNode, parse);
        [this.type] = parse(syntaxNode.childForFieldName("type")!);
        [this.length] = parse(syntaxNode.childForFieldName("dimensions"));
    }

    lower(ctx: LowerContext): Node | void {
        this.type = ctx.lower(this.type);

        if (this.length != null) {
            this.length = ctx.lower(this.length);

            ctx.edge({
                from: this.length,
                to: this,
                label: "length",
                description: "The length of the array. Must be an int.",
                example: ["new int[", "10", "]"],
            });

            ctx.typeConstraint(this.length, types.int);
        }

        ctx.typeConstraint(this, types.array(this.type));
    }
}
