/* Builds single-file versions for Blogger:  node tools/build-blogger.js [APPS_SCRIPT_URL]
   dist/blogger-page.html  -> paste into a Blogger PAGE (HTML view)
   dist/blogger-theme.xml  -> replace the whole theme (Theme > Edit HTML) for a clean full-screen app
   Images are embedded as small data URIs. PWA (service worker / manifest) is disabled in these builds: Blogger cannot host them at the site root. */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'); fs.mkdirSync(dist, { recursive: true });
const url = process.argv[2] || '';
const rd = (f) => fs.readFileSync(path.join(root, f), 'utf8');
function jpegUri(file, w) { // small JPEG data URI (needs Pillow; falls back to the original PNG)
  try { const out = execFileSync('python3', ['-c', `import sys,io,base64\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert('RGB')\nr=int(sys.argv[2])/im.width\nim=im.resize((int(sys.argv[2]),max(1,int(im.height*r))))\nb=io.BytesIO();im.save(b,'JPEG',quality=86,optimize=True);print(base64.b64encode(b.getvalue()).decode())`, path.join(root, file), String(w)]).toString().trim(); return 'data:image/jpeg;base64,' + out; }
  catch (e) { return 'data:image/png;base64,' + fs.readFileSync(path.join(root, file)).toString('base64'); }
}
const mark = jpegUri('icons/logo-mark.png', 260), full = jpegUri('icons/logo-full.png', 320), icon = jpegUri('icons/icon-192.png', 96), fav = jpegUri('icons/favicon-64.png', 48);
const order = ['config', 'util', 'db', 'store', 'api', 'charts', 'app', 'reports', 'settings', 'owner', 'start'];
let js = order.map((n) => '/* ---- ' + n + '.js ---- */\n' + rd('js/' + n + '.js')).join('\n');
js = js.replace("PWA: true,", "PWA: false,").replace("APPS_SCRIPT_URL: '',", "APPS_SCRIPT_URL: " + JSON.stringify(url) + ",")
  .replace(/LOGO_MARK: 'icons\/logo-mark\.png'/, 'LOGO_MARK: "' + mark + '"').replace(/LOGO_FULL: 'icons\/logo-full\.png'/, 'LOGO_FULL: "' + full + '"')
  .split("'icons/logo-mark.png'").join('"' + mark + '"').split("'icons/icon-192.png'").join('"' + icon + '"').split("'icons/logo-full.png'").join('"' + full + '"');
js = js.replace(/<\/script/gi, '<\\/script');
if (js.includes(']]>')) throw new Error('JS contains ]]> (breaks the Blogger XML CDATA)');
const css = rd('css/app.css');
const meta = '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><meta name="theme-color" content="#04122e"/><link id="favicon" rel="icon" type="image/jpeg" href="' + fav + '"/>';
const page = '<!-- GD Expense Tracker (Blogger page build) -->\n<style>\n' + css + '\n</style>\n<div id="root">Loading GD Expense Tracker…</div>\n<script>\n' + js + '\n</script>\n';
fs.writeFileSync(path.join(dist, 'blogger-page.html'), page);
const theme = `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE html>
<html b:version='2' class='v2' expr:dir='data:blog.languageDirection' xmlns='http://www.w3.org/1999/xhtml' xmlns:b='http://www.google.com/2005/gml/b' xmlns:data='http://www.google.com/2005/gml/data' xmlns:expr='http://www.google.com/2005/gml/expr'>
<head>
<meta charset='utf-8'/>
<title>GD Expense Tracker</title>
${meta.replace(/"/g, "'")}
<b:skin><![CDATA[
${css.replace(/\]\]>/g, ']] >')}
]]></b:skin>
</head>
<body>
<div id='root'>Loading GD Expense Tracker…</div>
<div style='display:none'><b:section class='main' id='main' showaddelement='no'><b:widget id='Blog1' locked='true' title='Blog Posts' type='Blog' version='2'/></b:section></div>
<script>
//<![CDATA[
${js}
//]]>
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(dist, 'blogger-theme.xml'), theme);
console.log('built', fs.statSync(path.join(dist, 'blogger-page.html')).size, 'bytes page,', fs.statSync(path.join(dist, 'blogger-theme.xml')).size, 'bytes theme');
