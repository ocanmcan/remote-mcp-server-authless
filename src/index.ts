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
		console.log("🔧 Initializing MCP server with tools...");
		
		// Simple addition tool
		this.server.tool(
			"add",
			{ 
				a: z.number().describe("First number to add"), 
				b: z.number().describe("Second number to add") 
			},
			async ({ a, b }) => {
				console.log(`🔧 Executing ADD tool: ${a} + ${b}`);
				const result = a + b;
				console.log(`🔧 ADD result: ${result}`);
				return {
					content: [{ 
						type: "text", 
						text: `${a} + ${b} = ${result}` 
					}],
				};
			}
		);

		// Calculator tool with multiple operations
		this.server.tool(
			"calculate",
			{
				operation: z.enum(["add", "subtract", "multiply", "divide"]).describe("Mathematical operation to perform"),
				a: z.number().describe("First number"),
				b: z.number().describe("Second number"),
			},
			async ({ operation, a, b }) => {
				console.log(`🔧 Executing CALCULATE tool: ${a} ${operation} ${b}`);
				let result: number;
				let operationSymbol: string;
				
				switch (operation) {
					case "add":
						result = a + b;
						operationSymbol = "+";
						break;
					case "subtract":
						result = a - b;
						operationSymbol = "-";
						break;
					case "multiply":
						result = a * b;
						operationSymbol = "×";
						break;
					case "divide":
						if (b === 0) {
							console.log("🔧 Division by zero error");
							return {
								content: [
									{
										type: "text",
										text: "Error: Cannot divide by zero",
									},
								],
							};
						}
						result = a / b;
						operationSymbol = "÷";
						break;
				}
				
				console.log(`🔧 CALCULATE result: ${result}`);
				return { 
					content: [{ 
						type: "text", 
						text: `${a} ${operationSymbol} ${b} = ${result}` 
					}] 
				};
			}
		);

		console.log("🔧 MCP server initialization complete");
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);
		
		// Enhanced logging
		console.log(`🔧 Incoming request: ${request.method} ${url.pathname}`);
		
		try {
			// Handle CORS preflight requests
			if (request.method === 'OPTIONS') {
				return new Response(null, {
					status: 200,
					headers: {
						'Access-Control-Allow-Origin': '*',
						'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
						'Access-Control-Allow-Headers': 'Content-Type, Authorization',
						'Access-Control-Max-Age': '86400',
					},
				});
			}

			// SSE endpoints
			if (url.pathname === "/sse" || url.pathname === "/sse/message") {
				console.log("🔧 Routing to SSE handler");
				const response = await MyMCP.serveSSE("/sse").fetch(request, env, ctx);
				
				// Add CORS headers
				const headers = new Headers(response.headers);
				headers.set('Access-Control-Allow-Origin', '*');
				
				return new Response(response.body, {
					status: response.status,
					statusText: response.statusText,
					headers: headers,
				});
			}
			
			// MCP endpoints - handle various path variations
			if (url.pathname === "/mcp" || 
				url.pathname === "/mcp/" || 
				url.pathname.startsWith("/mcp/")) {
				console.log("🔧 Routing to MCP handler");
				
				// Log request body for debugging
				if (request.method === 'POST') {
					const body = await request.text();
					console.log("🔧 Request body:", body);
					
					// Create new request with the body
					const newRequest = new Request(request.url, {
						method: request.method,
						headers: request.headers,
						body: body,
					});
					
					try {
						const response = await MyMCP.serve("/mcp").fetch(newRequest, env, ctx);
						console.log(`🔧 MCP handler response status: ${response.status}`);
						
						// Log response body for debugging
						const responseText = await response.text();
						console.log("🔧 Response body:", responseText);
						
						// Add CORS headers to MCP responses
						return new Response(responseText, {
							status: response.status,
							statusText: response.statusText,
							headers: {
								'Content-Type': 'application/json',
								'Access-Control-Allow-Origin': '*',
								'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
								'Access-Control-Allow-Headers': 'Content-Type, Authorization',
							},
						});
					} catch (error) {
						console.error("🔧 MCP handler error:", error);
						return new Response(JSON.stringify({
							jsonrpc: "2.0",
							error: {
								code: -32603,
								message: "Internal error",
								data: error.message
							},
							id: null
						}), {
							status: 500,
							headers: {
								'Content-Type': 'application/json',
								'Access-Control-Allow-Origin': '*',
							},
						});
					}
				} else {
					// Handle GET requests to MCP endpoint
					const response = await MyMCP.serve("/mcp").fetch(request, env, ctx);
					console.log(`🔧 MCP handler response status: ${response.status}`);
					
					// Add CORS headers
					const headers = new Headers(response.headers);
					headers.set('Access-Control-Allow-Origin', '*');
					
					return new Response(response.body, {
						status: response.status,
						statusText: response.statusText,
						headers: headers,
					});
				}
			}
			
			// Health check endpoint
			if (url.pathname === "/health" || url.pathname === "/") {
				return new Response(JSON.stringify({
					status: "healthy",
					server: "Authless Calculator MCP Server",
					version: "1.0.0",
					tools: ["add", "calculate"],
					endpoints: {
						mcp: "/mcp",
						sse: "/sse",
						health: "/health"
					},
					timestamp: new Date().toISOString()
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
				jsonrpc: "2.0",
				error: {
					code: -32603,
					message: "Internal server error",
					data: error.message
				},
				id: null
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
