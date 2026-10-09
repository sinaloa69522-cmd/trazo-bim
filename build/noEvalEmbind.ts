import type { Plugin } from "vite";

/**
 * El código de enlace de LibreDWG (embind de Emscripten) genera funciones con `new Function`,
 * y una página con una política de seguridad estricta (sin 'unsafe-eval', como las publicadas
 * en claude.ai) lo bloquea y el DWG no abre. Este plugin cambia esas dos fábricas por versiones
 * equivalentes que no evalúan texto; WebAssembly solo necesita 'wasm-unsafe-eval'.
 */
const INVOKER_FROM =
  "let[args,invokerFnBody]=createJsInvoker(argTypes,isClassMethodFunc,returns,isAsync);args.push(invokerFnBody);var invokerFn=newFunc(Function,args)(...closureArgs);";
const INVOKER_TO =
  "var invokerFn=function(...a){var destructors=needsDestructorStack?[]:null;var w=[cppTargetFunc];var thisWired;" +
  "if(isClassMethodFunc){thisWired=argTypes[1][\"toWireType\"](destructors,this);w.push(thisWired)}" +
  "var aw=[];for(var k=0;k<argTypes.length-2;++k){aw.push(argTypes[k+2][\"toWireType\"](destructors,a[k]));w.push(aw[k])}" +
  "var rv=cppInvokerFunc(...w);" +
  "if(needsDestructorStack){runDestructors(destructors)}else{for(var k=isClassMethodFunc?1:2;k<argTypes.length;++k){var p=k===1?thisWired:aw[k-2];if(argTypes[k].destructorFunction!==null)argTypes[k].destructorFunction(p)}}" +
  "if(returns)return argTypes[0][\"fromWireType\"](rv)};";

const CALLER_FROM = "params.push(functionBody);var invokerFunction=newFunc(Function,params)(...args);";
const CALLER_TO =
  "var invokerFunction=function(obj,func,destructorsRef,ptr){var al=[];if(kind===0)al.push(obj);var off=0;" +
  "for(var k=0;k<argCount;++k){al.push(types[k].readValueFromPointer(ptr+off));off+=types[k].argPackAdvance}" +
  "var rv=kind===1?new func(...al):func.call(...al);if(!retType.isVoid)return emval_returnValue(retType,destructorsRef,rv)};";

export function patchEmbind(code: string): string {
  if (!code.includes(INVOKER_FROM) || !code.includes(CALLER_FROM))
    throw new Error("noEvalEmbind: el código de LibreDWG cambió; revisa el parche de embind en build/noEvalEmbind.ts");
  return code.replace(INVOKER_FROM, INVOKER_TO).replace(CALLER_FROM, CALLER_TO);
}

export function noEvalEmbind(): Plugin {
  return {
    name: "no-eval-embind",
    enforce: "pre",
    transform(code, id) {
      if (!/libredwg-web[\\/]wasm[\\/]libredwg-web\.js$/.test(id.split("?")[0])) return null;
      return { code: patchEmbind(code), map: null };
    },
  };
}
