const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
// const WebpackObfuscator = require('webpack-obfuscator');

module.exports = {
  entry: {
    popup: "./src/popup.js",
    service_worker: "./src/service_worker.js",
    content_script: "./src/content_script.js",
  },
  output: {
    filename: "[name].js",
    path: path.resolve(__dirname, "build"),
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env"],
          },
        },
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.(png|jpe?g|gif|svg)$/i,
        loader: "file-loader",
        options: {
          name: "[path][name].[ext]",
        },
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "src/popup.html", to: "popup.html" },
        { from: "src/styles.css", to: "styles.css" },
        { from: "src/manifest.json", to: "." }
        // { from: 'src/assets', to: 'assets', noErrorOnMissing: true }
      ],
    }),
    // new WebpackObfuscator(
    //   {
    //     rotateStringArray: true,
    //   },
    //   []
    // ),
  ],
  optimization: {
    minimize: false,
  },
};