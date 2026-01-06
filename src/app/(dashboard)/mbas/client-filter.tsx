"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Client {
  id: string;
  name: string;
}

interface ClientFilterProps {
  clients: Client[];
  selectedClientId?: string;
}

export function ClientFilter({ clients, selectedClientId }: ClientFilterProps) {
  const router = useRouter();

  const handleValueChange = (value: string) => {
    if (value === "all") {
      router.push("/mbas");
    } else {
      router.push(`/mbas?client=${value}`);
    }
  };

  return (
    <Select
      value={selectedClientId || "all"}
      onValueChange={handleValueChange}
    >
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Filter by client" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Clients</SelectItem>
        {clients.map((client) => (
          <SelectItem key={client.id} value={client.id}>
            {client.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
