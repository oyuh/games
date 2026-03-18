const fs = require('fs');
const pages = ['ChainReactionPage', 'HomePage', 'ImposterPage', 'LocationSignalPage', 'PasswordBeginPage', 'PasswordGamePage', 'PasswordResultsPage', 'ShadeSignalPage'];

for (const page of pages) {
  const file = 'apps/web/src/pages/' + page + '.tsx';
  let content = fs.readFileSync(file, 'utf8');

  const exportRegex = new RegExp('export function ' + page + '\\\(({ sessionId }: { sessionId: string })\\\) \\\{');
  if (!exportRegex.test(content)) {
    console.log('Skipping or missing', page);
    continue;
  }

  content = content.replace(exportRegex, 'function ' + page + 'Desktop({ sessionId }: { sessionId: string }) {');

  // Replace hook
  const hookRegex1 = /  const isMobile = useIsMobile\(\);\n  if \(isMobile\) return <Mobile.*? \/>;\n/g;
  const hookRegex2 = /  const isMobile = useIsMobile\(\);\r\n  if \(isMobile\) return <Mobile.*? \/>;\r\n/g;

  let mobileComponentName = 'Mobile' + page;

  const match = content.match(/<Mobile[A-Za-z]+ sessionId={sessionId} \/>/);
  if (match) {
    mobileComponentName = match[0].replace('<', '').replace(' sessionId={sessionId} />', '');
  }

  content = content.replace(hookRegex1, '').replace(hookRegex2, '');

  content += '\nexport function ' + page + '({ sessionId }: { sessionId: string }) {\n' +
    '  const isMobile = useIsMobile();\n' +
    '  if (isMobile) return <' + mobileComponentName + ' sessionId={sessionId} />;\n' +
    '  return <' + page + 'Desktop sessionId={sessionId} />;\n' +
    '}\n';

  fs.writeFileSync(file, content);
  console.log('Processed', page);
}
