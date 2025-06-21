import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Authless Calculator",
		version: "1.0.0",
	});

	async init() {
		// Simple addition tool
		this.server.tool(
			"add",
			{ a: z.number(), b: z.number() },
			async ({ a, b }) => ({
				content: [{ type: "text", text: String(a + b) }],
			})
		);

		// Calculator tool with multiple operations
		this.server.tool(
			"calculate",
			{
				operation: z.enum(["add", "subtract", "multiply", "divide"]),
				a: z.number(),
				b: z.number(),
			},
			async ({ operation, a, b }) => {
				let result: number;
				switch (operation) {
					case "add":
						result = a + b;
						break;
					case "subtract":
						result = a - b;
						break;
					case "multiply":
						result = a * b;
						break;
					case "divide":
						if (b === 0)
							return {
								content: [
									{
										type: "text",
										text: "Error: Cannot divide by zero",
									},
								],
							};
						result = a / b;
						break;
				}
				return { content: [{ type: "text", text: String(result) }] };
			}
		);
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);
		
		// Enhanced logging
		console.log(`🔧 Incoming request: ${request.method} ${url.pathname}`);
		console.log(`🔧 Full URL: ${url.toString()}`);
		
		try {
			// Handle CORS preflight requests
			if (request.method === 'OPTIONS') {
				return new Response(null, {
					status: 200,
					headers: {
						'Access-Control-Allow-Origin': '*',
						'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
						'Access-Control-Allow-Headers': 'Content-Type, Authorization',
					},
				});
			}

			// SSE endpoints
			if (url.pathname === "/sse" || url.pathname === "/sse/message") {
				console.log("🔧 Routing to SSE handler");
				return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
			}
			
			// MCP endpoints - handle various path variations
			if (url.pathname === "/mcp" || 
				url.pathname === "/mcp/" || 
				url.pathname.startsWith("/mcp/")) {
				console.log("🔧 Routing to MCP handler");
				
				try {
					const response = await MyMCP.serve("/mcp").fetch(request, env, ctx);
					console.log(`🔧 MCP handler response status: ${response.status}`);
					
					// Add CORS headers to MCP responses
					const headers = new Headers(response.headers);
					headers.set('Access-Control-Allow-Origin', '*');
					headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
					headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
					
					return new Response(response.body, {
						status: response.status,
						statusText: response.statusText,
						headers: headers,
					});
				} catch (error) {
					console.error("🔧 MCP handler error:", error);
					return new Response(JSON.stringify({
						error: "MCP handler failed",
						details: error.message
					}), {
						status: 500,
						headers: {
							'Content-Type': 'application/json',
							'Access-Control-Allow-Origin': '*',
						},
					});
				}
			}
			
			// Health check endpoint
			if (url.pathname === "/health" || url.pathname === "/") {
				return new Response(JSON.stringify({
					status: "healthy",
					server: "Authless Calculator MCP Server",
					version: "1.0.0",
					endpoints: {
						mcp: "/mcp",
						sse: "/sse"
					}
				}), {
					headers: {
						'Content-Type': 'application/json',
						'Access-Control-Allow-Origin': '*',
					},
				});
			}
			
			console.log(`🔧 No route matched for: ${url.pathname}`);
			return new Response(JSON.stringify({
				error: "Not found",
				path: url.pathname,
				available_endpoints: ["/mcp", "/sse", "/health"]
			}), {
				status: 404,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
				},
			});
			
		} catch (error) {
			console.error("🔧 Request handling error:", error);
			return new Response(JSON.stringify({
				error: "Internal server error",
				details: error.message
			}), {
				status: 500,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
				},
			});
		}
	},
};
