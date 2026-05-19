# Models

this folder contains the Application data layer

## Workflow

1. Add a {model}/index.ts contianing your `interface`
2. Add a {model}/{model}Dao.ts containing your DAO that `extends` from `Dao.ts`
3. Add your Dao to the `DaoFactory.ts` file


## **/index.ts

file containing the definition of the model

## **/\*Dao.ts

File containing the implementation of the Dao

## Dao.ts

the Dao.ts is the file each `*Dao.ts` extends from allowing to have a simple, quick and easy to comprehend connectivity

## DaoFactory.ts

The DaoFactory file is the file in which you will have the only direct reference to each `*Dao` files and will be sent from there to the rest of the applicaiton layer
