/**
 * Render every screen to static HTML.
 *
 * This is not a substitute for looking at the product — it cannot catch a
 * layout that reads badly. It does catch the thing that would otherwise reach
 * the browser unnoticed: a screen that throws on its first render, formats a
 * missing date into "Invalid Date", or renders an empty table where content
 * was expected.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { fixtureWorkspace } from './fixtures/workspace';
import { Overview } from './screens/Overview';
import { CaptureInbox } from './screens/CaptureInbox';
import { CaseWorkspace } from './screens/CaseWorkspace';
import { Activity } from './screens/Activity';
import { Settings } from './screens/Settings';
import { CommitmentSheet } from './screens/CommitmentSheet';

const noop = async () => {};
const props = {
  workspace: fixtureWorkspace,
  onOpenCase: () => {},
  onOpenCommitment: () => {},
  toast: () => {},
  onNavigate: () => {},
};

export function renderAll(): Record<string, string> {
  const issue = fixtureWorkspace.issues[0];
  const commitment =
    fixtureWorkspace.issues.flatMap((i) => i.commitments).find((c) => c.status === 'open' && c.previousOwners.length > 0)
    ?? issue.commitments[0];
  return {
    overview: renderToStaticMarkup(<Overview {...props} />),
    capture: renderToStaticMarkup(<CaptureInbox {...props} onAccept={noop} onReject={noop} />),
    case: renderToStaticMarkup(<CaseWorkspace {...props} issueKey={issue.key} />),
    activity: renderToStaticMarkup(<Activity {...props} />),
    settings: renderToStaticMarkup(<Settings workspace={fixtureWorkspace} onChange={() => {}} toast={() => {}} />),
    drawer: renderToStaticMarkup(
      <CommitmentSheet
        issue={issue}
        commitment={commitment}
        onClose={() => {}}
        onVerify={noop}
        onReassign={noop}
        onDrop={noop}
      />,
    ),
  };
}
