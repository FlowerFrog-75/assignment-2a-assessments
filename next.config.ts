import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native gRPC/Fabric client libraries: load them with Node's require
  // instead of bundling them.
  serverExternalPackages: ["@hyperledger/fabric-gateway", "@grpc/grpc-js", "@hyperledger/fabric-protos"],
};

export default nextConfig;
