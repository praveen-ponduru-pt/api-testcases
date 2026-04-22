export interface RequestHeader {
  name: string;
  value: string;
}

export interface EndpointData {
  url: string;
  method: string;
  headers: RequestHeader[];
  body: string | null;
  responseBody: string | null;
}

export interface TestScenario {
  title: string;
  preconditions: string[];
  steps: string[];
  expectedResults: string[];
}

export interface TestCase {
  endpointKey: string;
  endpointLabel: string;
  scenarios: TestScenario[];
}

export interface GeneratedFiles {
  httpFileContent: string;
  envFileContent: string;
  testCases: TestCase[];
}
