import js from '@eslint/js';
import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
export default ts.config({ignores:['.next/**','node_modules/**','next-env.d.ts']},js.configs.recommended,...ts.configs.recommended,{
 files:['**/*.ts','**/*.tsx'],plugins:{'react-hooks':hooks},rules:{'no-undef':'off','@typescript-eslint/no-explicit-any':'off','@typescript-eslint/no-unused-vars':'off','no-empty':['error',{allowEmptyCatch:true}],'react-hooks/rules-of-hooks':'error'}
});
