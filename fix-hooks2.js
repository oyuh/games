const fs = require('fs');

const pages = ['ChainReactionPage', 'HomePage', 'ImposterPage', 'LocationSignalPage', 'PasswordBeginPage', 'PasswordGamePage', 'PasswordResultsPage', 'ShadeSignalPage'];

for (const page of pages) {
  const file = 'apps/web/src/pages/' + page + '.tsx';
  let content = fs.readFileSync(file, 'utf8');

  // We find exactly one instance of: export function PageName({ sessionId }: { sessionId: string }) {
  const targetStr = 'export function ' + page + '({ sessionId }: { sessionId: string }) {';
  const replaceStr = 'function ' + page + 'Desktop({ sessionId }: { sessionId: string }) {';
  
  if (!content.includes(targetStr)) {
    console.log('Could not find exact function def for', page);
    continue;
  }

  content = content.replace(targetStr, replaceStr);

  // We find the mobile hook exact string (could have \r\n or \n)
  let removedHook = false;
  const hookRegexMatches = [
    '  const isMobile = useIsMobile();\n  if (isMobile) return <Mobile' + page.replace('Page', '') + '(.*?)>;\n',
    '  const isMobile = useIsMobile();\r\n  if (isMobile) return <Mobile' + page.replace('Page', '') + '(.*?)>;\r\n'
  ];

  for (const regexStr of hookRegexMatches) {
    const rx = new RegExp(regexStr);
    const match = content.match(rx);
    if (match) {
        content = content.replace(rx, '');
        removedHook = true;
        break;
    }
  }

  if (!removedHook) {
      // Fallback find
      const fallbackRx = /  const isMobile = useIsMobile\(.+;\s+/;
      content = content.replace(fallbackRx, '');
  }

  const mobileComponentMatch = content.match(/<Mobile[A-Za-z]+ sessionId={sessionId} \/>/);
  let mobileName = 'Mobile' + page;

  content += '\nexport function ' + page + '({ sessionId }: { sessionId: string }) {\n' +
    '  const isMobile = useIsMobile();\n' +
    '  if (isMobile) return <' + (page === 'HomePage' ? 'MobileHomePage' : 'Mobile' + page) + ' sessionId={sessionId} />;\n' +
    '  return <' + page + 'Desktop sessionId={sessionId} />;\n' +
    '}\n';

  fs.writeFileSync(file, content);
  console.log('Successfully fixed', page);
}

