const express = require('express');
const { ThirdwebSDK } = require("@thirdweb-dev/sdk");
const dotenv = require("dotenv");
const { fetch } = require("node-fetch");
const { POOLADDRESSPROVIDER_ABI, POOLADDRESSPROVIDER_ADDRESS, LINK_TOKEN_ADDRESS, USDT_TOKEN_ADDRESS, TBA_TOKEN_ACCOUNT, TBA_NFT_TOKEN, tokenToAtokens, stakingRewardToken } = require('./constants')
dotenv.config();
const app = express();

const config = {
    erc1155RegistryAddress: "0x000000006551c19487814612e58FE06813775758",
    erc1155Proxy: "0x55266d75D1a14E4572138116aF39863Ed6596E7F",
    erc1155AccountImplementation: "0x41C8f39463A868d3A88af00cd0fe7102F30E44eC",
};
let sdk = null
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.post('/set-wallet', async (req, res) => {
    try {
        const { privKey } = req.body;
        if (!privKey) {
            return res.status(500).send({ error: error.message });

        }
        sdk = ThirdwebSDK.fromPrivateKey(
            privKey,
            "sepolia",
            { secretKey: process.env.THIRDWEB_SECRET_KEY }
        );

        return res.status(200).send({
            success: true,
            data: null
        })
    } catch (error) {
        res.status(500).send({ error: error.message });

    }
})
app.post('/deploy-and-mint-nft', async (req, res) => {
    try {
        // if (!sdk) {
        //     return res.status(500).send({ error: "wallet not initialised" });


        const { name, description, privKey } = req.body;
        // }
        sdk = ThirdwebSDK.fromPrivateKey(
            privKey,
            "sepolia",
            { secretKey: process.env.THIRDWEB_SECRET_KEY }
        );

        const nftContractAddress = await sdk.deployer.deployNFTCollection({
            name: name,
            description: description,
            primary_sale_recipient: await sdk.wallet.getAddress(),
        });

        console.log(`NFT Contract deployed on ${nftContractAddress}`);

        // Mint an NFT

        res.status(200).send({
            success: true,
            data: {
                nftContractAddress,
                // nftContractId: nftId
            }
        })


    } catch (error) {
        res.status(500).send({ error: error.message });
    }

})

app.post('/mint', async (req, res) => {
    try {
        const { name, description, nftContractAddress, privKey } = req.body;
        sdk = ThirdwebSDK.fromPrivateKey(
            privKey,
            "sepolia",
            { secretKey: process.env.THIRDWEB_SECRET_KEY }
        );
        const nftContract = await sdk.getContract(
            nftContractAddress,
            "nft-collection"
        );
        const newNFT = await nftContract.erc721.mint({
            name: name,
            description: description,
        });
        console.log(`Minted token ID ${newNFT.id}`);

        res.status(200).send({
            success: true,
            data: {
                nftContractAddress,
                nftContractId: newNFT.id
            }
        })

    } catch (error) {
        res.status(500).send({ error: error.message });

    }
})

app.post('/create-tba', async (req, res) => {
    try {
        const { nftContractAddress, privKey, nftId } = req.body;
        sdk = ThirdwebSDK.fromPrivateKey(
            privKey,
            "sepolia",
            { secretKey: process.env.THIRDWEB_SECRET_KEY }
        );
        const erc6551RegistryContract = await sdk.getContract(
            config.erc1155RegistryAddress,
            "custom"
        );

        await erc6551RegistryContract.call("createAccount", [
            config.erc1155AccountImplementation,
            "0x3132323300000000000000000000000000000000000000000000000000000000",
            await sdk.wallet.getChainId(),
            nftContractAddress,
            nftId,
        ]);

        const tbaAddress = await erc6551RegistryContract.call("account", [
            config.erc1155AccountImplementation,
            "0x3132323300000000000000000000000000000000000000000000000000000000",
            await sdk.wallet.getChainId(),
            nftContractAddress,
            nftId,
        ]);
        res.status(200).send({
            success: true,
            data: {
                nftContractAddress,
                nftContractId: nftId,
                tbaAddress
            }
        })
    } catch (error) {
        res.status(500).send({ error: error.message });

    }
})

app.post('/tranfer-erc20-to-tba', async (req, res) => {
    try {
        const { erc20Address, privKey, amount, tbaAddress } = req.body;
        sdk = ThirdwebSDK.fromPrivateKey(
            privKey,
            "sepolia",
            { secretKey: process.env.THIRDWEB_SECRET_KEY }
        );
        const usdtTokenAddress = await sdk.getContract(erc20Address, "custom");

        const usdtTransferTransaction = await usdtTokenAddress.call("transfer", [
            tbaAddress,
            amount
        ])
        res.status(200).send({
            success: true,
            data: {
                erc20Address,
                reciept: usdtTransferTransaction.receipt.transactionHash,
                tbaAddress
            }
        })

    } catch (error) {
        res.status(500).send({ error: error.message });

    }
})

app.post("/depoit-to-aave", async (req, res) => {
    try {

        const { erc20Address, privKey, amount, tbaAddress } = req.body;
        sdk = ThirdwebSDK.fromPrivateKey(
            privKey,
            "sepolia",
            { secretKey: process.env.THIRDWEB_SECRET_KEY }
        );
        const referralCode = '0'

        const lpAddressProviderContract = await sdk.getContract(POOLADDRESSPROVIDER_ADDRESS, 'custom');

        const lpCoreAddress = await lpAddressProviderContract.call("getPool")
        const usdtTokenAddress = await sdk.getContract(erc20Address, "custom");

        const approveTransaction = usdtTokenAddress.encoder.encode("approve", [
            lpCoreAddress,
            amount
        ])
        const tbaContract = await sdk.getContract(tbaAddress, "custom");

        const tbaTxnApprove = await tbaContract.call("execute", [
            erc20Address,
            0,
            approveTransaction,
            0,
        ]);
        console.log(tbaTxnApprove.receipt.transactionHash, "done approval");


        const lendingPoolContract = await sdk.getContract(lpCoreAddress, "custom");

        const lendingPoolSupplyTransaction = lendingPoolContract.encoder.encode("supply", [
            erc20Address,
            amount,
            tbaAddress,
            referralCode
        ])


        const supplyTransaction = await tbaContract.call("execute", [
            lpCoreAddress,
            0,
            lendingPoolSupplyTransaction,
            0,
        ]);
        console.log(supplyTransaction.receipt.transactionHash, "done supplying");

        res.status(200).send({
            success: true,
            data: {
                erc20Address,
                approvalReciept: tbaTxnApprove.receipt.transactionHash,
                supplyReciept: supplyTransaction.receipt.transactionHash,
            }
        })


    } catch (error) {
        res.status(500).send({ error: error.message });

    }
})
// to be implemented
app.post('/deposit-lp-tokens', async (req, res) => {
    try {
        const { erc20Address, privKey, amount, tbaAddress } = req.body;

        sdk = ThirdwebSDK.fromPrivateKey(
            privKey,
            "sepolia",
            { secretKey: process.env.THIRDWEB_SECRET_KEY }
        );

        const usdtTokenAddress = await sdk.getContract(erc20Address, "custom");
        const symbol = await usdtTokenAddress.call("symbol");
        if (!(symbol.toString().toLowerCase() in usdtTokenAddress)) {
            return res.status(500).send({ error: "Sorry we dont support that token yet" });
        }

        const aTokenContract = await sdk.getContract(tokenToAtokens[symbol.toString().toLowerCase()], "custom");



    } catch (error) {
        res.status(500).send({ error: error.message });

    }
})

app.post('/withdraw-from-aave', async (req, res) => {
    try {
        const { erc20Address, privKey, amount, tbaAddress } = req.body;

        sdk = ThirdwebSDK.fromPrivateKey(
            privKey,
            "sepolia",
            { secretKey: process.env.THIRDWEB_SECRET_KEY }
        );

        // const usdtTokenAddress = await sdk.getContract(erc20Address, "custom");
        const referralCode = '0'

        const lpAddressProviderContract = await sdk.getContract(POOLADDRESSPROVIDER_ADDRESS, 'custom');

        const lpCoreAddress = await lpAddressProviderContract.call("getPool")
        const usdtTokenAddress = await sdk.getContract(erc20Address, "custom");
        const tbaContract = await sdk.getContract(tbaAddress, "custom");
        const lendingPoolContract = await sdk.getContract(lpCoreAddress, "custom");


        const lendingPoolSupplyTransaction = lendingPoolContract.encoder.encode("withdraw", [
            erc20Address,
            amount,
            tbaAddress,
        ])


        const supplyTransaction = await tbaContract.call("execute", [
            lpCoreAddress,
            0,
            lendingPoolSupplyTransaction,
            0,
        ]);


        res.status(200).send({
            success: true,
            data: {
                erc20Address,
                withdrawReciept: supplyTransaction.receipt.transactionHash,
            }
        })



    } catch (error) {
        res.status(500).send({ error: error.message });

    }
})

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});