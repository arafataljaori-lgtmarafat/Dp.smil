const fs = require('fs');
let content = fs.readFileSync('apps/mobile/src/creation/image-creation-editor.tsx', 'utf8');

content = content.replace(/const \{ creationId \} = useLocalSearchParams.*?;\n/g, '');
content = content.replace(/export function ImageCreationEditor\(\{ creationId, creation, workspace \}: \{ creationId: string, creation: any, workspace: any \}\): React\.JSX\.Element \{\n  const \{ creationId \} = useLocalSearchParams.*?;\n/g, 'export function ImageCreationEditor({ creationId, creation, workspace }: { creationId: string, creation: any, workspace: any }): React.JSX.Element {\n');

// Also fix creation.data to creation
content = content.replace(/creation\.data\?/g, 'creation?');
content = content.replace(/creation\.data\b/g, 'creation');
content = content.replace(/workspace\.data\?/g, 'workspace?');
content = content.replace(/workspace\.data\b/g, 'workspace');

// Fix loader checks
content = content.replace(/if \(authState\.status !== 'authenticated' \|\| creation\.isPending\) return <LoadingState label="Loading secure creation\.\.\." \/>;\n/g, '');
content = content.replace(/if \(creation\.isError \|\| creation === undefined\) return <ErrorState detail="This creation could not be loaded." onRetry=\{\(\) => void creation\.refetch\(\)\} \/>;\n/g, '');

fs.writeFileSync('apps/mobile/src/creation/image-creation-editor.tsx', content);
