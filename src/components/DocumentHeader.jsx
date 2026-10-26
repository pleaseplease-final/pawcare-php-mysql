export default function DocumentHeader({title,children}) {
  return <header className="document-letterhead"><strong>PawCare Veterinary Clinic</strong><h1>{title}</h1>{children&&<p>{children}</p>}</header>;
}
