import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const designerConfig = {
    entryPoints: ['src/designer/webview/main.ts'],
    bundle: true,
    outfile: 'out/webview/designer.js',
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    sourcemap: true,
    minify: !watch,
};

/** @type {esbuild.BuildOptions} */
const propgridConfig = {
    entryPoints: ['src/designer/webview/propgridMain.ts'],
    bundle: true,
    outfile: 'out/webview/propgrid.js',
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    sourcemap: true,
    minify: !watch,
};

if (watch) {
    const ctx1 = await esbuild.context(designerConfig);
    const ctx2 = await esbuild.context(propgridConfig);
    await ctx1.watch();
    await ctx2.watch();
    console.log('[esbuild] watching webviews...');
} else {
    await esbuild.build(designerConfig);
    await esbuild.build(propgridConfig);
    console.log('[esbuild] webviews built.');
}
