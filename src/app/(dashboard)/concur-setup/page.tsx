"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ConcurList {
  id: string;
  value: string;
  levelCount: number;
  category: { id: string; type: string };
}

export default function ConcurSetupPage() {
  const [requestToken, setRequestToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [result, setResult] = useState<{
    status: "success" | "error";
    message: string;
  } | null>(null);
  const [testResult, setTestResult] = useState<{
    status: "success" | "error";
    message: string;
    lists?: ConcurList[];
  } | null>(null);

  async function handleTestConnection() {
    setIsTesting(true);
    setTestResult(null);
    try {
      const response = await fetch("/api/concur/test");
      const data = await response.json();
      if (response.ok && data.status === "success") {
        setTestResult({
          status: "success",
          message: `Connected. Found ${data.listCount} lists.`,
          lists: data.lists,
        });
      } else {
        setTestResult({
          status: "error",
          message: data.error || "Test failed",
        });
      }
    } catch (err) {
      setTestResult({ status: "error", message: String(err) });
    } finally {
      setIsTesting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!requestToken.trim()) return;

    setIsSubmitting(true);
    setResult(null);

    try {
      const response = await fetch("/api/concur/initial-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestToken: requestToken.trim() }),
      });

      const data = await response.json();

      if (response.ok && data.status === "success") {
        setResult({
          status: "success",
          message: `Connected to Concur. Geolocation: ${data.geolocation}. Token expires: ${data.expiresAt}`,
        });
        setRequestToken("");
      } else {
        let diag = "";
        if (data.diagnostic) {
          const d = data.diagnostic;
          diag = `\n\nToken: prefix="${d.tokenPrefix}", length=${d.tokenLength}, startsWithAt=${d.startsWithAt}`;
          if (d.envCheck) {
            const e = d.envCheck;
            diag += `\nClient ID: ...${e.clientIdSuffix} (${e.clientIdLength} chars)`;
            diag += `\nClient Secret: ...${e.clientSecretSuffix} (${e.clientSecretLength} chars)`;
            diag += `\nCompany UUID: ...${e.companyUuidSuffix} (${e.companyUuidLength} chars)`;
            diag += `\nToken URL: ${e.tokenUrl}`;
          }
        }
        setResult({
          status: "error",
          message: (data.error || "Token exchange failed") + diag,
        });
      }
    } catch (err) {
      setResult({ status: "error", message: String(err) });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Concur Setup"
        description="One-time setup to connect MBA Tracker to SAP Concur"
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Exchange Company Request Token</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              Generate a Company Request Token in Concur (Authentication Admin
              → Company Request Token), then paste it here. The token expires
              in 24 hours and can only be used once.
            </p>
            <p>
              After exchange, the refresh token is stored in the database and
              auto-refreshes every 6 months.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="requestToken">Company Request Token</Label>
              <Input
                id="requestToken"
                type="text"
                value={requestToken}
                onChange={(e) => setRequestToken(e.target.value)}
                placeholder="Paste the token here"
                disabled={isSubmitting}
                autoComplete="off"
              />
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || !requestToken.trim()}
            >
              {isSubmitting ? "Exchanging..." : "Exchange Token"}
            </Button>
          </form>

          {result && (
            <div
              className={`rounded-md border p-4 text-sm ${
                result.status === "success"
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              <p className="font-medium">
                {result.status === "success" ? "Success" : "Error"}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{result.message}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Test Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Verify the API connection works by fetching all lists from Concur.
            This will also show the list IDs you need for the integration
            (projects, departments, business units, etc.).
          </p>

          <Button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting}
            variant="outline"
          >
            {isTesting ? "Testing..." : "Test Connection"}
          </Button>

          {testResult && (
            <div
              className={`rounded-md border p-4 text-sm ${
                testResult.status === "success"
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              <p className="font-medium">
                {testResult.status === "success" ? "Success" : "Error"}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{testResult.message}</p>
              {testResult.lists && testResult.lists.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="font-medium">Lists found:</p>
                  <ul className="text-xs space-y-1 font-mono">
                    {testResult.lists.map((list) => (
                      <li key={list.id}>
                        <span className="font-bold">{list.value}</span> —{" "}
                        <span className="text-muted-foreground">
                          {list.id} (levels: {list.levelCount}, type: {list.category?.type})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
