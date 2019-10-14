import cheerio from 'cheerio';
import axios from 'axios';
import { readFile, exists, writeFile } from './fs';
import { join } from 'path';
import mkdir from 'make-dir';

function isElement(el: Node): el is Element {
    return el.nodeType === 1; // 1 === document.ELEMENT_NODE
}

export function getPathTo(element: Element): string {
    if (isElement(element)) {
        if (element.id && element.id !== '')
            return 'id("' + element.id + '")';
    }
    if (element.tagName === 'body')
        return '/html/body';

    let ix = 0;
    const siblings = element.parentNode ? element.parentNode.childNodes : [];
    for (let i = 0; i < siblings.length; i++) {
        const sibling = siblings[i];
        if (sibling === element)
            return getPathTo(element.parentNode as Element) + '/' + element.tagName + (ix + 1 === 1 ? '' : '[' + (ix + 1) + ']');
        if (sibling.nodeType === 1 && (sibling as Element).tagName === element.tagName)
            ix++;
    }
    console.error('Element has no parent node or does not exist:\n', element);
    return '';
}

export function writeClickFunction(element: Element) {
    const xpath = getPathTo(element);
    // console.log(element);
    const fName = (element.textContent || (element as any).attribs['href']).replace(/[^a-zA-Z]/g, '').trim();
    return `
export function click_${fName}() {
    (document.evaluate('${xpath}', document.body, null, XPathResult.FIRST_ORDERED_NODE_TYPE)!.singleNodeValue as HTMLElement).click();
}
    `.trim();
}

export async function generate(html: string | Buffer) {
    const $ = cheerio.load(html);
    let code = '';
    $('button').each((i, element) => {
        code += writeClickFunction($(element).get(0)) + '\n';
        // console.log('found button', element);
    });
    $('a').each((i, element) => {
        code += writeClickFunction($(element).get(0)) + '\n';
        // console.log('found anchor', element);
    })
    // TODO: more elements, use worker_threads for each element type

    return code
}

export async function fromFile(path: string) {
    if (!await exists(path)) {
        throw new Error('File does not exist: ' + path);
    }
    return generate(await readFile(path));
}

export async function fromUrl(url: string) {
    const response = await axios.get(url);
    if (response.status !== 200) {
        throw new Error(`Received a non 200 response when requesting: ${url}. Status: ${response.status}, ${response.statusText}`);
    }
    return generate(response.data);
}

export async function thanks(resourcePath: string, outputDirPath?: string) {
    const code = await (resourcePath.startsWith('http') ? fromUrl(resourcePath) : fromFile(resourcePath));
    const outPath = outputDirPath ? outputDirPath : join(__dirname, '..', 'example', 'generated');
    await mkdir(outPath);

    return await writeFile(join(outPath, 'page.ts'), code);
}

export default thanks;
