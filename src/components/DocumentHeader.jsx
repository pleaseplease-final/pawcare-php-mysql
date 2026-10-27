import { OfficialLetterhead } from "./OfficialDocument.jsx";

// Printed clinic letterhead and document title. `meta` adds [label, value] pairs such as the document number.
export default function DocumentHeader({title,meta,children}) {
  return <OfficialLetterhead title={title} meta={meta}>{children}</OfficialLetterhead>;
}
