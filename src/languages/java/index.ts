import treeSitterJava from "tree-sitter-java/tree-sitter-java.wasm?url";
import { compiler } from "@/compiler/index";
import * as nodes from "./nodes";

const defaultOptions = {
    showTypes: true,
};

export default compiler(treeSitterJava, defaultOptions, {
    identifier: nodes.IdentifierNode,
    type_identifier: nodes.TypeIdentifierNode,
    underscore_pattern: nodes.UnderscorePatternNode,
    this: nodes.ThisNode,
    field_access: nodes.FieldAccessNode,
    method_invocation: nodes.MethodInvocationNode,
    local_variable_declaration: nodes.LocalVariableDeclarationNode,
    field_declaration: nodes.FieldDeclarationNode,
    assignment_expression: nodes.AssignmentExpressionNode,
    decimal_integer_literal: nodes.DecimalIntegerLiteralNode,
    string_literal: nodes.StringLiteralNode,
    true: nodes.TrueNode,
    false: nodes.FalseNode,
    null: nodes.NullNode,
    integral_type: nodes.IntegralTypeNode,
    floating_point_type: nodes.FloatingPointTypeNode,
    boolean_type: nodes.BooleanTypeNode,
    void_type: nodes.VoidTypeNode,
    array_type: nodes.ArrayTypeNode,
    formal_parameter: nodes.FormalParameterNode,
    class_declaration: nodes.ClassDeclarationNode,
    method_declaration: nodes.MethodDeclarationNode,
    constructor_declaration: nodes.ConstructorDeclarationNode,
    array_initializer: nodes.ArrayInitializerNode,
    array_access: nodes.ArrayAccessNode,
    binary_expression: nodes.BinaryExpressionNode,
    block: nodes.BlockNode,
    constructor_body: nodes.ConstructorBodyNode,
    if_statement: nodes.IfStatementNode,
    ternary_expression: nodes.TernaryExpressionNode,
    return_statement: nodes.ReturnStatementNode,
    update_expression: nodes.UpdateExpressionNode,
    object_creation_expression: nodes.ObjectCreationExpressionNode,
    array_creation_expression: nodes.ArrayCreationExpressionNode,
});
