// SM2 加密辅助脚本 - 从 stdin 读取 JSON {key, data}，输出加密hex
const sm2 = require('sm-crypto').sm2;

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
    const { key, data } = JSON.parse(input);
    const result = sm2.doEncrypt(data, key, 1);
    process.stdout.write(result);
});
