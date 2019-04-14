'use strict';

import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import visualizer from 'rollup-plugin-visualizer';
import { terser } from "rollup-plugin-terser";
import replace from 'rollup-plugin-replace';
import filesize from 'rollup-plugin-filesize';
import multiEntry from 'rollup-plugin-multi-entry';
import alias from 'rollup-plugin-alias';

export default [{
  input: 'build/web/src/index.js',
  output: {
    file: 'dist/gaxios.js',
    format: 'esm'
  },
  external: [
    'node-fetch',
    'url'
  ],
  plugins: [
    replace({ 'process.env.IS_BROWSER': !!process.env.IS_BROWSER }),
    resolve(),
    commonjs(),
    // terser(),
    visualizer(),
    filesize()
  ]
}, {
  input: 'build/web/browser-test/*.js',
  output: {
    file: 'dist/browser-test.js',
    format: 'esm'
  },
  plugins: [
    alias({
      '../src/index': 'poop'
    }),
    multiEntry(),
    resolve({
      browser: true
    }),
    commonjs({
      namedExports: { 'chai': ['assert' ] },
    }),
  ]
}];
