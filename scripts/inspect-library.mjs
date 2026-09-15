const LIBRARY_URL =
  'https://build-wars.github.io/gw-skilldata/gw-skilldata-es6-src.mjs';

const response = await fetch(LIBRARY_URL);

if (!response.ok) {
  throw new Error(
    `Could not download library source: ${response.status} ${response.statusText}`,
  );
}

const source = await response.text();

console.log(`Downloaded ${source.length.toLocaleString()} characters.`);
console.log('\nFirst occurrences of type-related text:\n');

const lines = source.split('\n');

for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];

  if (
    /skilltype|skill_type|type.*label|type.*name|preparation|binding ritual/i.test(
      line,
    )
  ) {
    console.log(`${index + 1}: ${line}`);
  }
}