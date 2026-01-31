<?php

namespace App\DataFixtures;

use App\Entity\Building;
use App\Entity\Customer;
use App\Entity\Speculation;
use App\Entity\User;
use Doctrine\Bundle\FixturesBundle\Fixture;
use Doctrine\Persistence\ObjectManager;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

class AppFixtures extends Fixture
{
    public function __construct(private UserPasswordHasherInterface $passwordHasher)
    {
    }

    public function load(ObjectManager $manager): void
    {
        // 1. Création du Super Admin
        $admin = new User();
        $admin->setUsername('admin');
        $admin->setFullname('Super Administrateur');
        $admin->setCode('ADM-001');
        $admin->setType('BOTH');
        $admin->setRoles(['ROLE_SUPER_ADMIN']);
        $admin->setPassword($this->passwordHasher->hashPassword($admin, 'admin123'));
        $manager->persist($admin);

        // 2. Création des Spéculations (Types d'animaux)
        $specs = ['Poulet de chair', 'Pondeuse', 'Porc', 'Bovin'];
        $specObjects = [];
        
        foreach ($specs as $label) {
            $spec = new Speculation();
            $spec->setName($label);
            $manager->persist($spec);
            $specObjects[] = $spec; // On garde en mémoire pour les lier aux clients
        }

        // 3. Création d'un Client Test
        $customer = new Customer();
        $customer->setName('Ferme Modèle');
        $customer->setZone('Littoral');
        $customer->setExactLocation('Douala - Village');
        $customer->setIsDealer(false);
        $customer->setIsDirectBuyer(true);
        // On lui ajoute quelques spéculations
        $customer->addSpeculation($specObjects[0]); // Poulet de chair
        $customer->addSpeculation($specObjects[1]); // Pondeuse
        $manager->persist($customer);

        // 4. Création de 2 Bâtiments pour ce client
        for ($i = 1; $i <= 2; $i++) {
            $building = new Building();
            $building->setCustomer($customer);
            $building->setMaxCapacity(1000 * $i);
            // Le nom sera généré automatiquement par votre Listener "BuildingNamingListener"
            // Mais les fixtures bypassent parfois les listeners selon la config.
            // Si le listener est actif, on ne set pas le nom. Sinon :
            $building->setName('Bâtiment ' . $i); 
            $manager->persist($building);
        }

        $manager->flush();
    }
}