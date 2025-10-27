import NotebookDocClient from "./notebook-client-doc";

export const dynamic = 'force-dynamic';

export default function NotebookDocPage({ params }: { params: { docId: string } }) {
  return <NotebookDocClient docId={params.docId} />;
}
