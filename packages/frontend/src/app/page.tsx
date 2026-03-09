"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radio } from "lucide-react";

export default function Home() {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [error, setError] = useState("");
  const { setApiKey } = useAuth();
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!apiKeyInput.trim()) {
      setError("Please enter an API key");
      return;
    }

    // Simple validation - in production this would verify against the backend
    if (apiKeyInput.length < 8) {
      setError("API key must be at least 8 characters");
      return;
    }

    setApiKey(apiKeyInput.trim());
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Radio className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl">Event Radar</CardTitle>
          <CardDescription>
            Real-time event-driven trading intelligence
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="Enter your API key"
                value={apiKeyInput}
                onChange={(e) => {
                  setApiKeyInput(e.target.value);
                  setError("");
                }}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <Button type="submit" className="w-full">
              Access Dashboard
            </Button>
          </form>
          
          <div className="mt-4 text-center text-sm text-muted-foreground">
            <p>Don&apos;t have an API key?</p>
            <p className="text-xs mt-1">Contact your administrator to get access.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
