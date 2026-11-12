import { useState } from "react";
import { SearchContext } from "../hooks/useSearch";

/* Global search term shared between the header's expandable search
   and the page content (e.g. Table filters its rows with it).
   `placeholder` lets the active page describe what is searchable. */
export function SearchProvider({ children }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [placeholder, setPlaceholder] = useState("Search…");

  return (
    <SearchContext.Provider value={{ searchTerm, setSearchTerm, placeholder, setPlaceholder }}>
      {children}
    </SearchContext.Provider>
  );
}
