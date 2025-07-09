"use client";

import { IUiMessage } from "@/schemas/user";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { Hourglass, Lightbulb, AlertTriangle, CheckCircle } from "lucide-react";

const icons = {
  hourglass: <Hourglass className="h-5 w-5" />,
  warning: <AlertTriangle className="h-5 w-5" />,
  success: <CheckCircle className="h-5 w-5" />,
};

export function UiMessage({ id, type, title, message, location, style }: IUiMessage) {
  const Icon = style?.icon ? icons[style.icon as keyof typeof icons] : <Lightbulb className="h-5 w-5" />;

  return (
    <Card key={id} className="mb-4" style={{ backgroundColor: style?.backgroundColor, color: style?.textColor }}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {Icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p>{message}</p>
      </CardContent>
    </Card>
  );
}