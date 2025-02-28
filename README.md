# researchkg_interactive
website to visualize and interact with.json output from researchkg notebook from this repo: https://github.com/ps1526/researchkg

First, go to the researchkg repo and then generate a EnhancedCitation Graph based on any paper of your choice and then take the json output and upload it to this app to interact with it

Deployed @ https://researchkgvisualizer.vercel.app

Issues: If you try to upload a graph with a lot of nodes, i.e more than about 100 papers with about 8 connecting papers + however many author nodes there are, it will be laggy just because of the gravity adjustments for D3 so give it time. Currently, trying to switch to Sigma.js because of the WebGL capabilities so rendering very large citation graphs will be quicker and easier to interact with.

Next Steps: Combine both researchkg repo with this one so that it becomes a one stop shop. 



