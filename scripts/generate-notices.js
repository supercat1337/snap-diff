// generate-notices.js (для license-checker)
import { readFileSync, writeFileSync } from 'fs';

// ---------- ПОЛНЫЕ ТЕКСТЫ ЛИЦЕНЗИЙ ----------
const LICENSE_TEXTS = {
    MIT: `MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,

    ISC: `ISC License

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER
RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF
CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`,

    'Apache-2.0': `Apache License, Version 2.0

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   ... (полный текст Apache-2.0, можно скопировать из предыдущего скрипта) ...`,

    'BSD-3-Clause': `BSD 3-Clause License

Copyright (c) <year>, <copyright holder>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`,

    'BSD-2-Clause': `BSD 2-Clause License

Copyright (c) <year>, <copyright holder>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`,

    'BlueOak-1.0.0': `# Blue Oak Model License

Version 1.0.0

## Purpose

This license gives everyone as much permission to work with
this software as possible, while protecting contributors
from liability.

## Acceptance

In order to receive this license, you must agree to its
rules. The rules of this license are both obligations
under that agreement and conditions to your license.
You must not do anything with this software that triggers
a rule that you cannot or will not follow.

## Copyright

Each contributor licenses you to do everything with this
software that would otherwise infringe that contributor's
copyright in it.

## Notices

You must ensure that everyone who gets a copy of any part of
this software from you, with or without changes, also gets
the text of this license or a link to
<https://blueoakcouncil.org/license/1.0.0>.

## Excuse

If anyone notifies you in writing that you have not
complied with Notices, you can keep your license by taking
all practical steps to comply within 30 days after the notice.
If you do not do so, your license ends immediately.

## Patent

Each contributor licenses you to do everything with this
software that would otherwise infringe any patent claims
they can license or become able to license.

## Reliability

No contributor can revoke this license.

## No Liability

***As far as the law allows, this software comes as is,
without any warranty or condition, and no contributor
will be liable to anyone for any damages related to this
software or this license, under any kind of legal claim.***`,
};

// ---------- НОРМАЛИЗАЦИЯ ЛИЦЕНЗИЙ ----------
function normalizeLicense(license) {
    if (!license) return 'Unknown';
    // Убираем скобки и лишние пробелы
    let clean = license.trim().replace(/^\(|\)$/g, '');
    // Если содержит OR, берём первую часть
    if (clean.includes(' OR ')) {
        clean = clean.split(' OR ')[0].trim();
    }
    // Специальные случаи: (MIT OR WTFPL) -> MIT
    if (clean === 'MIT' || clean === 'WTFPL') return 'MIT';
    // (BSD-2-Clause OR MIT OR Apache-2.0) -> BSD-2-Clause (можно изменить приоритет)
    if (clean === 'BSD-2-Clause' || clean === 'MIT' || clean === 'Apache-2.0')
        return 'BSD-2-Clause';
    return clean;
}

// ---------- ГЛАВНАЯ ----------
function generateNotices() {
    // Читаем JSON из файла licenses.json
    const rawData = JSON.parse(readFileSync('licenses.json', 'utf8'));

    const packagesByLicense = {};

    Object.entries(rawData).forEach(([key, info]) => {
        // Ключ имеет формат "package@version"
        const atIndex = key.lastIndexOf('@');
        const name = key.substring(0, atIndex);
        const version = key.substring(atIndex + 1);

        // Определяем лицензию
        const rawLicense = info.licenses || 'Unknown';
        const license = normalizeLicense(rawLicense);

        // Автор (publisher или из author, если есть)
        let author = info.publisher || info.author || 'Unknown';
        // Убираем email, если есть в формате "Name <email>"
        if (author.includes('<')) {
            author = author.split('<')[0].trim();
        }

        // Репозиторий (очищаем от лишнего)
        let repository = info.repository || '';
        if (repository.startsWith('git+')) repository = repository.slice(4);
        if (repository.endsWith('.git')) repository = repository.slice(0, -4);

        if (!packagesByLicense[license]) {
            packagesByLicense[license] = [];
        }

        packagesByLicense[license].push({
            name,
            version,
            author,
            repository,
        });
    });

    // ---------- ГЕНЕРАЦИЯ ВЫХОДНОГО ФАЙЛА ----------
    let output = 'THIRD-PARTY NOTICES\n';
    output += '===================\n\n';
    output +=
        'This project includes third-party software components licensed under various open-source licenses.\n';
    output +=
        'Below is a list of these components, their copyright notices, and the full license texts.\n\n';
    output += '====================================================================\n\n';

    // Порядок вывода лицензий (можно изменить)
    const licenseOrder = [
        'MIT',
        'ISC',
        'Apache-2.0',
        'BSD-3-Clause',
        'BSD-2-Clause',
        'BlueOak-1.0.0',
    ];

    for (const lic of licenseOrder) {
        if (packagesByLicense[lic] && packagesByLicense[lic].length > 0) {
            output += `▶ ${lic.toUpperCase()} LICENSE\n`;
            output += `${'='.repeat(lic.length + 10)}\n\n`;
            output += `The following packages are distributed under the ${lic} license:\n\n`;

            // Сортируем пакеты по имени
            packagesByLicense[lic].sort((a, b) => a.name.localeCompare(b.name));

            packagesByLicense[lic].forEach(pkg => {
                output += `- ${pkg.name}@${pkg.version}\n`;
                if (pkg.repository) output += `  Repository: ${pkg.repository}\n`;
                output += `  Copyright: ${pkg.author}\n\n`;
            });

            output += '\n---\n\n';
            output += LICENSE_TEXTS[lic] || '[License text not available]';
            output += '\n\n';
            output += '====================================================================\n\n';
        }
    }

    // Обработка оставшихся лицензий (например, 'Unknown' или другие)
    const otherLicenses = Object.keys(packagesByLicense).filter(l => !licenseOrder.includes(l));
    if (otherLicenses.length > 0) {
        output += '▶ OTHER LICENSES\n';
        output += '================\n\n';
        otherLicenses.forEach(lic => {
            output += `License: ${lic}\n`;
            packagesByLicense[lic].forEach(pkg => {
                output += `- ${pkg.name}@${pkg.version}\n`;
                output += `  Copyright: ${pkg.author}\n\n`;
            });
            output += '---\n\n';
        });
    }

    writeFileSync('THIRD-PARTY-NOTICES.txt', output, 'utf8');
    console.log('✅ THIRD-PARTY-NOTICES.txt успешно создан!');
}

generateNotices();
