// Run with
// rm -rf documentation/learning-path && ts-node scripts/strapi2rst.ts

import { MongoClient } from 'mongodb';
import fs from 'fs';
import { promisify } from 'util';
import slugify from '@sindresorhus/slugify';
import _ from 'lodash';
import { md2rst } from './md2rst';

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

// Connection URL
const url = 'mongodb://localhost:27017';

// Database Name
const dbName = 'strapi';

const basePath = `${__dirname}/../documentation/learning-path`;

function writeDocFile(path: string, content: string) {
  return writeFile(`${basePath}/${path}`, content);
}

function mkDocDir(path: string) {
  return mkdir(`${basePath}/${path}`);
}

// Use connect method to connect to the server
async function main() {
  let client;
  try {
    client = await MongoClient.connect(url);
    const db = client.db(dbName);
    const guides = await db
      .collection('Guide')
      .find()
      .toArray();

    await mkDocDir(``);

    for (const guide of guides) {
      guide.path = `${guide.Slug}`;
      guide.slug = guide.Slug;
      await mkDocDir(guide.path);

      const sections = _.sortBy(
        await db
          .collection('section')
          .find({ guide: guide._id })
          .sort({ Order: 1 })
          .toArray(),
        'Order'
      );
      guide.sections = sections;
      for (const section of sections) {
        section.path = `${guide.path}/${slugify(section.Title)}`;
        section.slug = slugify(section.Title);

        await mkDocDir(section.path);

        const pages = _.sortBy(
          await db
            .collection('page')
            .find({ section: section._id })
            .sort({ Order: 1 })
            .toArray(),
          'Order'
        );
        section.pages = pages;
        for (const page of pages) {
          page.slug = slugify(page.Title);
          page.path = `${section.path}/${slugify(page.Title)}`;
          await writeDocFile(
            page.path + '.rst',
            await md2rst(
              `
# ${page.Title}

${page.Content}            
          `
            )
          );
        }

        await writeDocFile(
          `${section.path}/index.rst`,
          await md2rst(`
# ${section.Title}

${section.Description}
      `)
        );
      }

      await writeDocFile(
        `${guide.path}/index.rst`,
        (await md2rst(`
# ${guide.Title}

${guide.Description}
`)) +
          `
.. toctree::
  :maxdepth: 2
  :caption: Contents:
  
${_.flatMap(guide.sections, section => {
  return [
    `  ${section.Title}<${section.slug}/index>`,
    ...section.pages.map(
      (page: { Title: string; slug: string }) =>
        `    ${page.Title}<${section.slug}/${page.slug}>`
    )
  ];
}).join('\n')}
`
      );
    }

    await writeDocFile(
      'index.rst',
      `

Learning Path
=============

.. toctree::
  :maxdepth: 2
  :caption: Contents:

${guides
  .map((guide: { Title: string; slug: string }) => {
    return `  ${guide.Title}<${guide.slug}/index>`;
  })
  .join('\n')}
    `
    );
  } finally {
    if (client) {
      client.close();
    }
  }
}

main().catch(e => console.error(e));