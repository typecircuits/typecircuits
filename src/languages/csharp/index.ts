import treeSitterCSharp from "tree-sitter-c-sharp/tree-sitter-c_sharp.wasm?url";
import { compiler } from "@/compiler/index";
import * as nodes from "./nodes";

const defaultOptions = {
    showTypes: true,
};

export default compiler(treeSitterCSharp, defaultOptions, {
    identifier: nodes.IdentifierNode,
    type: nodes.TypeNode,
    implicit_type: nodes.ImplicitTypeNode,
    underscore_pattern: nodes.UnderscorePatternNode,
    this: nodes.ThisNode,
    member_access_expression: nodes.MemberAccessExpressionNode,
    invocation_expression: nodes.InvocationExpressionNode,
    variable_declaration: nodes.VariableDeclarationNode,
    field_declaration: nodes.FieldDeclarationNode,
    assignment_expression: nodes.AssignmentExpressionNode,
    integer_literal: nodes.IntegerLiteralNode,
    string_literal: nodes.StringLiteralNode,
    boolean_literal: nodes.BooleanLiteralNode,
    null_literal: nodes.NullLiteralNode,
    predefined_type: nodes.PredefinedTypeNode,
    array_type: nodes.ArrayTypeNode,
    parameter: nodes.ParameterNode,
    class_declaration: nodes.ClassDeclarationNode,
    method_declaration: nodes.MethodDeclarationNode,
    local_function_statement: nodes.LocalFunctionStatementNode,
    constructor_declaration: nodes.ConstructorDeclarationNode,
    initializer_expression: nodes.InitializerExpressionNode,
    element_access_expression: nodes.ElementAccessExpressionNode,
    binary_expression: nodes.BinaryExpressionNode,
    block: nodes.BlockNode,
    if_statement: nodes.IfStatementNode,
    conditional_expression: nodes.ConditionalExpressionNode,
    return_statement: nodes.ReturnStatementNode,
    postfix_unary_expression: nodes.PostfixUnaryExpressionNode,
    object_creation_expression: nodes.ObjectCreationExpressionNode,
    pointer_type: nodes.PointerTypeNode,
    declaration_expression: nodes.DeclarationExpressionNode,
});
