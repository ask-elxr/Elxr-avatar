import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Lock, Shield } from "lucide-react";

export default function AdminLogin() {
  const [secret, setSecret] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Secret": secret,
        },
      });

      if (response.ok) {
        localStorage.setItem("admin_secret", secret);
        toast({
          title: "Welcome back",
          description: "Redirecting to admin panel...",
        });
        setTimeout(() => setLocation("/admin"), 500);
      } else {
        toast({
          title: "Access denied",
          description: "Invalid admin credentials",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Unable to verify credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-gray-800/50 border-gray-700 backdrop-blur-sm">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-purple-600/20 rounded-full flex items-center justify-center">
            <Shield className="w-8 h-8 text-purple-400" />
          </div>
          <CardTitle className="text-2xl text-white">ELXR Admin</CardTitle>
          <CardDescription className="text-gray-400">
            Enter your admin credentials to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="secret" className="text-gray-300">
                Admin Secret
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  id="secret"
                  type="password"
                  placeholder="Enter your admin secret"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  className="pl-10 bg-gray-700/50 border-gray-600 text-white placeholder:text-gray-500"
                  data-testid="input-admin-secret"
                  autoFocus
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full bg-purple-600 hover:bg-purple-700"
              disabled={!secret || isLoading}
              data-testid="button-admin-login"
            >
              {isLoading ? "Verifying..." : "Access Admin Panel"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
